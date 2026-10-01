import { beforeEach, describe, expect, mock, test } from "bun:test";
import { mockFetch } from "./testFetch.ts";

const redisStore = new Map<string, string>();
const shopRooms = new Map<string, Set<string>>();
const mockRedis = {
	get: mock(async (key: string) => redisStore.get(key) ?? null),
	setex: mock(async (key: string, _ttl: number, value: string) => {
		redisStore.set(key, value);
	}),
	del: mock(async (key: string) => {
		redisStore.delete(key);
	}),
	sadd: mock(async (key: string, member: string) => {
		const set = shopRooms.get(key) ?? new Set<string>();
		set.add(member);
		shopRooms.set(key, set);
		return 1;
	}),
	smembers: mock(async (key: string) => [...(shopRooms.get(key) ?? [])]),
};

mock.module("../redis.ts", () => ({ getRedis: () => mockRedis }));
mock.module("../serviceAuth.ts", () => ({
	getServiceToken: mock(async () => "service-token"),
	invalidateServiceToken: mock(() => {}),
}));

import {
	applyMembershipChange,
	startMembershipSubscriber,
} from "../membership.ts";

type Left = { room: string; rooms: string[] };

function createIo(
	sockets: Array<{ id: string; userId: string; rooms: string[] }>,
) {
	const left: Left[] = [];
	const emitted: Array<{ room: string; event: string; data: unknown }> = [];
	return {
		left,
		emitted,
		in: (room: string) => ({
			socketsLeave: (rooms: string[]) => {
				left.push({ room, rooms });
			},
			fetchSockets: async () =>
				sockets
					.filter((socket) => socket.rooms.includes(room))
					.map((socket) => ({
						id: socket.id,
						data: { userId: socket.userId },
						leave: (target: string) => {
							left.push({ room: `socket:${socket.id}`, rooms: [target] });
						},
					})),
		}),
		to: (room: string) => ({
			emit: (event: string, data: unknown) => {
				emitted.push({ room, event, data });
			},
		}),
	};
}

beforeEach(() => {
	redisStore.clear();
	shopRooms.clear();
	mockRedis.del.mockClear();
});

describe("applyMembershipChange with removed users", () => {
	test("drops the cached member set", async () => {
		redisStore.set(
			"shop:s-1:inbox-members",
			JSON.stringify(["u-owner", "u-staff"]),
		);
		const io = createIo([]);
		await applyMembershipChange(io, {
			type: "shop.members.changed",
			shopId: "s-1",
			removedUserIds: ["u-staff"],
		});
		expect(mockRedis.del).toHaveBeenCalledWith("shop:s-1:inbox-members");
	});

	test("makes the removed user's sockets leave the shop rooms, across nodes", async () => {
		shopRooms.set(
			"shop:s-1:rooms",
			new Set(["conversation:c-1", "conversation:c-2"]),
		);
		const io = createIo([]);
		await applyMembershipChange(io, {
			type: "shop.members.changed",
			shopId: "s-1",
			removedUserIds: ["u-staff"],
		});
		// `io.in(...).socketsLeave(...)` is what crosses nodes through the
		// Redis adapter; a per-socket leave would only reach this process.
		expect(io.left).toEqual([
			{
				room: "user:u-staff",
				rooms: ["conversation:c-1", "conversation:c-2", "shop-inbox:s-1"],
			},
		]);
	});

	test("tells the removed user their access is gone", async () => {
		const io = createIo([]);
		await applyMembershipChange(io, {
			type: "shop.members.changed",
			shopId: "s-1",
			removedUserIds: ["u-staff", "u-mgr"],
		});
		expect(io.emitted).toEqual([
			{
				room: "user:u-staff",
				event: "shop:access-revoked",
				data: { shopId: "s-1" },
			},
			{
				room: "user:u-mgr",
				event: "shop:access-revoked",
				data: { shopId: "s-1" },
			},
		]);
	});

	test("does not refetch the member set when the ids are named", async () => {
		const fetchMock = mockFetch(
			async () =>
				new Response(JSON.stringify({ userIds: [] }), { status: 200 }),
		);
		globalThis.fetch = fetchMock;
		const io = createIo([]);
		await applyMembershipChange(io, {
			type: "shop.members.changed",
			shopId: "s-1",
			removedUserIds: ["u-staff"],
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("applyMembershipChange with an empty removedUserIds", () => {
	test("refetches the set and evicts every socket no longer in it", async () => {
		shopRooms.set("shop:s-1:rooms", new Set(["conversation:c-1"]));
		globalThis.fetch = mockFetch(
			async () =>
				new Response(JSON.stringify({ userIds: ["u-owner"] }), { status: 200 }),
		);

		const io = createIo([
			{ id: "sock-owner", userId: "u-owner", rooms: ["shop-inbox:s-1"] },
			{ id: "sock-staff", userId: "u-staff", rooms: ["shop-inbox:s-1"] },
		]);
		await applyMembershipChange(io, {
			type: "shop.members.changed",
			shopId: "s-1",
			removedUserIds: [],
		});

		expect(io.left).toEqual([
			{
				room: "user:u-staff",
				rooms: ["conversation:c-1", "shop-inbox:s-1"],
			},
		]);
		expect(io.emitted).toEqual([
			{
				room: "user:u-staff",
				event: "shop:access-revoked",
				data: { shopId: "s-1" },
			},
		]);
	});

	test("evicts nobody when everyone in the room is still a member", async () => {
		globalThis.fetch = mockFetch(
			async () =>
				new Response(JSON.stringify({ userIds: ["u-owner", "u-staff"] }), {
					status: 200,
				}),
		);
		const io = createIo([
			{ id: "sock-owner", userId: "u-owner", rooms: ["shop-inbox:s-1"] },
			{ id: "sock-staff", userId: "u-staff", rooms: ["shop-inbox:s-1"] },
		]);
		await applyMembershipChange(io, {
			type: "shop.members.changed",
			shopId: "s-1",
			removedUserIds: [],
		});
		expect(io.left).toEqual([]);
	});

	test("evicts everyone when the shop went inactive and the set is now empty", async () => {
		globalThis.fetch = mockFetch(
			async () =>
				new Response(JSON.stringify({ userIds: [] }), { status: 200 }),
		);
		const io = createIo([
			{ id: "sock-owner", userId: "u-owner", rooms: ["shop-inbox:s-1"] },
			{ id: "sock-staff", userId: "u-staff", rooms: ["shop-inbox:s-1"] },
		]);
		await applyMembershipChange(io, {
			type: "shop.members.changed",
			shopId: "s-1",
			removedUserIds: [],
		});
		expect(io.left.map((entry) => entry.room).sort()).toEqual([
			"user:u-owner",
			"user:u-staff",
		]);
	});
});

describe("startMembershipSubscriber", () => {
	test("subscribes to chat:membership and applies each message", async () => {
		// Boxed in an object: a plain `let` reassigned only inside the mocked
		// `subscribe` closure narrows to `null` at this read under
		// `noUncheckedIndexedAccess`'s flow analysis, which does not follow
		// assignments made from inside a called function.
		const state: { handler: ((message: string) => void) | null } = {
			handler: null,
		};
		const subscriber = {
			subscribe: mock(
				async (_channel: string, cb: (message: string) => void) => {
					state.handler = cb;
				},
			),
		};
		const io = createIo([]);
		await startMembershipSubscriber(io, subscriber);
		expect(subscriber.subscribe).toHaveBeenCalledWith(
			"chat:membership",
			expect.any(Function),
		);

		state.handler?.(
			JSON.stringify({
				type: "shop.members.changed",
				shopId: "s-1",
				removedUserIds: ["u-staff"],
			}),
		);
		await Bun.sleep(0);
		expect(io.emitted).toEqual([
			{
				room: "user:u-staff",
				event: "shop:access-revoked",
				data: { shopId: "s-1" },
			},
		]);
	});

	test("ignores a malformed payload rather than crashing the process", async () => {
		const state: { handler: ((message: string) => void) | null } = {
			handler: null,
		};
		const subscriber = {
			subscribe: mock(
				async (_channel: string, cb: (message: string) => void) => {
					state.handler = cb;
				},
			),
		};
		const io = createIo([]);
		await startMembershipSubscriber(io, subscriber);
		state.handler?.("{not json");
		state.handler?.(JSON.stringify({ type: "something.else", shopId: "s-1" }));
		state.handler?.(JSON.stringify({ type: "shop.members.changed" }));
		await Bun.sleep(0);
		expect(io.emitted).toEqual([]);
	});
});
