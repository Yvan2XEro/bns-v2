import { describe, expect, mock, test } from "bun:test";
import { getRoomId, joinRoom, leaveRoom } from "../rooms.ts";

mock.module("../cache.ts", () => ({
	hasConversationAccess: mock(() => Promise.resolve(true)),
	getParticipants: mock(() => Promise.resolve([])),
	invalidateParticipants: mock(() => Promise.resolve()),
	verifyTokenCached: mock(() => Promise.resolve({ userId: "user-1" })),
}));

import { hasConversationAccess } from "../cache.ts";

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
		} as any;

		const result = await joinRoom(mockSocket, "conv-1", "user-1");

		expect(result).toBe(true);
		expect(joinedRooms).toContain("conversation:conv-1");
	});

	test("rejects when access is denied", async () => {
		(hasConversationAccess as ReturnType<typeof mock>).mockResolvedValue(false);

		const mockSocket = {
			join: mock(() => Promise.resolve()),
		} as any;

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
		} as any;

		leaveRoom(mockSocket, "conv-42");

		expect(leftRooms).toContain("conversation:conv-42");
	});
});
