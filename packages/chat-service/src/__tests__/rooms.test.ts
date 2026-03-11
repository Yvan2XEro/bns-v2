import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { getRoomId, verifyConversationAccess, joinRoom, leaveRoom } from "../rooms.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("getRoomId", () => {
	test("formats room ID correctly", () => {
		expect(getRoomId("conv-123")).toBe("conversation:conv-123");
	});

	test("handles different conversation ID formats", () => {
		expect(getRoomId("abc")).toBe("conversation:abc");
		expect(getRoomId("123-456-789")).toBe("conversation:123-456-789");
	});
});

describe("verifyConversationAccess", () => {
	test("returns true when user is a participant", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({ participants: ["user-1", "user-2"] }),
					{ status: 200 },
				),
			),
		) as typeof fetch;

		const result = await verifyConversationAccess("user-1", "conv-1", "tok");
		expect(result).toBe(true);
	});

	test("returns false when user is not a participant", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({ participants: ["user-1", "user-2"] }),
					{ status: 200 },
				),
			),
		) as typeof fetch;

		const result = await verifyConversationAccess("user-3", "conv-1", "tok");
		expect(result).toBe(false);
	});

	test("returns false when API returns non-OK status", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("Not found", { status: 404 })),
		) as typeof fetch;

		const result = await verifyConversationAccess("user-1", "nonexistent", "tok");
		expect(result).toBe(false);
	});

	test("returns false when fetch throws (network error)", async () => {
		globalThis.fetch = mock(() =>
			Promise.reject(new Error("Network error")),
		) as typeof fetch;

		const result = await verifyConversationAccess("user-1", "conv-1", "tok");
		expect(result).toBe(false);
	});

	test("calls the correct API endpoint", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ participants: ["user-1"] }), {
					status: 200,
				}),
			),
		) as typeof fetch;

		await verifyConversationAccess("user-1", "conv-abc", "tok");

		const fetchCall = (globalThis.fetch as ReturnType<typeof mock>).mock
			.calls[0] as [string];
		expect(fetchCall[0]).toContain("/conversations/conv-abc?depth=0");
	});
});

describe("joinRoom", () => {
	test("joins the room when access is granted", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({ participants: ["user-1"] }),
					{ status: 200 },
				),
			),
		) as typeof fetch;

		const joinedRooms: string[] = [];
		const mockSocket = {
			join: mock((room: string) => {
				joinedRooms.push(room);
				return Promise.resolve();
			}),
		} as any;

		const result = await joinRoom(mockSocket, "conv-1", "user-1", "tok");

		expect(result).toBe(true);
		expect(joinedRooms).toContain("conversation:conv-1");
	});

	test("rejects when access is denied", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({ participants: ["user-2"] }),
					{ status: 200 },
				),
			),
		) as typeof fetch;

		const mockSocket = {
			join: mock(() => Promise.resolve()),
		} as any;

		const result = await joinRoom(mockSocket, "conv-1", "user-99", "tok");

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
