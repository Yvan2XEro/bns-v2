import { beforeEach, describe, expect, mock, test } from "bun:test";
import { mockFetch } from "./testFetch.ts";

const redisStore = new Map<string, string>();
const mockRedis = {
	get: mock(async (key: string) => redisStore.get(key) ?? null),
	setex: mock(async (key: string, _ttl: number, value: string) => {
		redisStore.set(key, value);
	}),
	del: mock(async (key: string) => {
		redisStore.delete(key);
	}),
};

mock.module("../redis.ts", () => ({ getRedis: () => mockRedis }));
mock.module("../serviceAuth.ts", () => ({
	getServiceToken: mock(async () => "service-token"),
	invalidateServiceToken: mock(() => {}),
}));

import {
	applySystemMessage,
	type SystemMessagePublished,
	startSystemMessageSubscriber,
} from "../systemMessages.ts";

function createIo() {
	const emitted: Array<{ room: string; event: string; data: unknown }> = [];
	return {
		emitted,
		to: (room: string) => ({
			emit: (event: string, data: unknown) => {
				emitted.push({ room, event, data });
			},
		}),
	};
}

function published(
	overrides: Partial<SystemMessagePublished> = {},
): SystemMessagePublished {
	return {
		type: "order.system_message",
		conversationId: "c-1",
		messageId: "m-1",
		kind: "system",
		systemEvent: "order.confirmed",
		systemParams: { orderNumber: "BNS-1" },
		content: "Commande BNS-1 confirmée.",
		createdAt: "2026-09-15T00:00:00.000Z",
		...overrides,
	};
}

beforeEach(() => {
	redisStore.clear();
});

describe("applySystemMessage", () => {
	test("emits message:new with kind, systemEvent and systemParams to the conversation room and each participant's user room", async () => {
		redisStore.set(
			"conv:c-1:meta",
			JSON.stringify({ participants: ["u-buyer", "u-owner"], shopId: "s-1" }),
		);
		const io = createIo();
		await applySystemMessage(io, published());

		expect(io.emitted).toEqual([
			{
				room: "conversation:c-1",
				event: "message:new",
				data: {
					id: "m-1",
					conversationId: "c-1",
					sender: "",
					content: "Commande BNS-1 confirmée.",
					createdAt: "2026-09-15T00:00:00.000Z",
					kind: "system",
					systemEvent: "order.confirmed",
					systemParams: { orderNumber: "BNS-1" },
				},
			},
			{
				room: "user:u-buyer",
				event: "message:new",
				data: expect.objectContaining({ id: "m-1" }),
			},
			{
				room: "user:u-owner",
				event: "message:new",
				data: expect.objectContaining({ id: "m-1" }),
			},
		]);
	});

	test("needs no API round-trip", async () => {
		// The cache entry is warm, exactly as it would be by the time an order
		// posts a system message: a participant has to have joined the
		// conversation at least once for the message to matter to them, and
		// joining is what populates `getConversationMeta`'s cache. Ruling 2 in
		// the P4 plan's Conflicts section is that the channel carries the
		// message itself for this same reason — there is no authenticated
		// route for this service to "load" a private message with.
		redisStore.set(
			"conv:c-1:meta",
			JSON.stringify({ participants: ["u-buyer"], shopId: null }),
		);
		const fetchMock = mockFetch(
			async () => new Response("{}", { status: 200 }),
		);
		globalThis.fetch = fetchMock;

		const io = createIo();
		await applySystemMessage(io, published());

		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("startSystemMessageSubscriber", () => {
	test("subscribes to chat:system and applies each message", async () => {
		redisStore.set(
			"conv:c-1:meta",
			JSON.stringify({ participants: ["u-buyer"], shopId: null }),
		);
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
		const io = createIo();
		await startSystemMessageSubscriber(io, subscriber);
		expect(subscriber.subscribe).toHaveBeenCalledWith(
			"chat:system",
			expect.any(Function),
		);

		state.handler?.(JSON.stringify(published()));
		await Bun.sleep(0);

		expect(io.emitted.some((entry) => entry.room === "conversation:c-1")).toBe(
			true,
		);
	});

	test("ignores a malformed payload", async () => {
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
		const io = createIo();
		await startSystemMessageSubscriber(io, subscriber);

		state.handler?.("{not json");
		state.handler?.(JSON.stringify({ type: "order.system_message" }));
		await Bun.sleep(0);

		expect(io.emitted).toEqual([]);
	});

	test("ignores a payload for another message type", async () => {
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
		const io = createIo();
		await startSystemMessageSubscriber(io, subscriber);

		state.handler?.(
			JSON.stringify({ ...published(), type: "shop.members.changed" }),
		);
		await Bun.sleep(0);

		expect(io.emitted).toEqual([]);
	});
});
