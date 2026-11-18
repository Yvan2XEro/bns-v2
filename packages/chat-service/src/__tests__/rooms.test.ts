import { describe, expect, mock, test } from "bun:test";

const shopRooms = new Map<string, Set<string>>();
const mockRedis = {
	sadd: mock(async (key: string, member: string) => {
		const set = shopRooms.get(key) ?? new Set<string>();
		set.add(member);
		shopRooms.set(key, set);
		return 1;
	}),
	smembers: mock(async (key: string) => [...(shopRooms.get(key) ?? [])]),
};

mock.module("../redis.ts", () => ({ getRedis: () => mockRedis }));

mock.module("../cache.ts", () => ({
	hasConversationAccess: mock(() => Promise.resolve(true)),
	getConversationMeta: mock(() =>
		Promise.resolve({ participants: [], shopId: null }),
	),
	getInboxMembers: mock(() => Promise.resolve([])),
	invalidateConversationMeta: mock(() => Promise.resolve()),
	invalidateInboxMembers: mock(() => Promise.resolve()),
	fetchInboxMembers: mock(() => Promise.resolve([])),
	verifyTokenCached: mock(() => Promise.resolve({ userId: "user-1" })),
}));

import { getInboxMembers, hasConversationAccess } from "../cache.ts";
import {
	getRoomId,
	joinRoom,
	joinShopInbox,
	leaveRoom,
	leaveShopInbox,
	shopInboxRoom,
} from "../rooms.ts";

describe("getRoomId", () => {
	test("formats room ID correctly", () => {
		expect(getRoomId("conv-123")).toBe("conversation:conv-123");
	});

	test("handles different conversation ID formats", () => {
		expect(getRoomId("abc")).toBe("conversation:abc");
		expect(getRoomId("123-456-789")).toBe("conversation:123-456-789");
	});
});

describe("joinRoom", () => {
	test("joins the room when access is granted", async () => {
		(hasConversationAccess as ReturnType<typeof mock>).mockResolvedValue(true);

		const joinedRooms: string[] = [];
		const mockSocket = {
			join: mock((room: string) => {
				joinedRooms.push(room);
				return Promise.resolve();
			}),
		};

		const result = await joinRoom(mockSocket, "conv-1", "user-1");

		expect(result).toBe(true);
		expect(joinedRooms).toContain("conversation:conv-1");
	});

	test("rejects when access is denied", async () => {
		(hasConversationAccess as ReturnType<typeof mock>).mockResolvedValue(false);

		const mockSocket = {
			join: mock(() => Promise.resolve()),
		};

		const result = await joinRoom(mockSocket, "conv-1", "user-99");

		expect(result).toBe(false);
		expect(mockSocket.join).not.toHaveBeenCalled();
	});
});

describe("leaveRoom", () => {
	test("leaves the correct room", () => {
		const leftRooms: string[] = [];
		const mockSocket = {
			leave: mock((room: string) => {
				leftRooms.push(room);
			}),
		};

		leaveRoom(mockSocket, "conv-42");

		expect(leftRooms).toContain("conversation:conv-42");
	});
});

describe("shopInboxRoom", () => {
	test("names the room after the shop", () => {
		expect(shopInboxRoom("s-1")).toBe("shop-inbox:s-1");
	});
});

describe("joinShopInbox", () => {
	test("joins and records the room when the user is an inbox member", async () => {
		(getInboxMembers as ReturnType<typeof mock>).mockResolvedValue(["u-staff"]);
		const joined: string[] = [];
		const socket = {
			join: mock(async (room: string) => {
				joined.push(room);
			}),
		};
		expect(await joinShopInbox(socket, "s-1", "u-staff")).toBe(true);
		expect(joined).toContain("shop-inbox:s-1");
	});

	test("refuses a user who is not an inbox member", async () => {
		(getInboxMembers as ReturnType<typeof mock>).mockResolvedValue(["u-owner"]);
		const socket = { join: mock(async () => {}) };
		expect(await joinShopInbox(socket, "s-1", "u-staff")).toBe(false);
		expect(socket.join).not.toHaveBeenCalled();
	});
});

describe("leaveShopInbox", () => {
	test("leaves the shop room", () => {
		const leftRooms: string[] = [];
		const socket = {
			leave: mock((room: string) => {
				leftRooms.push(room);
			}),
		};
		leaveShopInbox(socket, "s-1");
		expect(leftRooms).toEqual(["shop-inbox:s-1"]);
	});
});
