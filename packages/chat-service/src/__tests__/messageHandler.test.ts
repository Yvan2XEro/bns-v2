import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mockFetch } from "./testFetch.ts";

let rateLimitCounter = 0;

const mockRedis = {
	incr: mock(() => {
		rateLimitCounter++;
		return Promise.resolve(rateLimitCounter);
	}),
	expire: mock(() => Promise.resolve()),
};

mock.module("../redis.ts", () => ({
	getRedis: () => mockRedis,
}));

mock.module("../cache.ts", () => ({
	hasConversationAccess: mock(() => Promise.resolve(true)),
	getConversationMeta: mock(() =>
		Promise.resolve({ participants: ["user-1", "user-2"], shopId: null }),
	),
	getInboxMembers: mock(() => Promise.resolve([])),
	invalidateConversationMeta: mock(() => Promise.resolve()),
	invalidateInboxMembers: mock(() => Promise.resolve()),
	fetchInboxMembers: mock(() => Promise.resolve([])),
	verifyTokenCached: mock(() => Promise.resolve({ userId: "user-1" })),
}));

mock.module("../serviceAuth.ts", () => ({
	getServiceToken: mock(() => Promise.resolve("service-token")),
	invalidateServiceToken: mock(() => {}),
}));

import { getConversationMeta, hasConversationAccess } from "../cache.ts";
import { registerMessageHandlers } from "../messageHandler.ts";

const originalFetch = globalThis.fetch;

beforeEach(() => {
	rateLimitCounter = 0;
	mockRedis.incr.mockImplementation(() => {
		rateLimitCounter++;
		return Promise.resolve(rateLimitCounter);
	});
	mockRedis.incr.mockClear();
	mockRedis.expire.mockClear();
	(hasConversationAccess as ReturnType<typeof mock>).mockResolvedValue(true);
	(getConversationMeta as ReturnType<typeof mock>).mockResolvedValue({
		participants: ["user-1", "user-2"],
		shopId: null,
	});
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function createMockSocketAndIo() {
	const handlers = new Map<string, Function>();
	const socketEmitted: Array<{ event: string; data: any }> = [];
	const emittedToRoom: Array<{ room: string; event: string; data: any }> = [];
	const emittedToIoRoom: Array<{
		room: string;
		event: string;
		data: any;
	}> = [];

	const socket = {
		on: mock((event: string, handler: Function) => {
			handlers.set(event, handler);
		}),
		emit: mock((event: string, data: any) => {
			socketEmitted.push({ event, data });
		}),
		to: mock((room: string) => ({
			emit: mock((event: string, data: any) => {
				emittedToRoom.push({ room, event, data });
			}),
		})),
	};

	const io = {
		to: mock((room: string) => ({
			emit: mock((event: string, data: any) => {
				emittedToIoRoom.push({ room, event, data });
			}),
		})),
	};

	return {
		socket,
		io,
		handlers,
		socketEmitted,
		emittedToRoom,
		emittedToIoRoom,
	};
}

describe("registerMessageHandlers", () => {
	test("registers message:send, message:delivered, and message:read handlers", () => {
		const { socket, io, handlers } = createMockSocketAndIo();

		registerMessageHandlers(io as never, socket as never, "user-1");

		expect(handlers.has("message:send")).toBe(true);
		expect(handlers.has("message:delivered")).toBe(true);
		expect(handlers.has("message:read")).toBe(true);
	});
});

describe("message:send", () => {
	test("persists message and emits message:new to room on success", async () => {
		const { socket, io, handlers, socketEmitted, emittedToIoRoom } =
			createMockSocketAndIo();
		registerMessageHandlers(io as never, socket as never, "user-1");

		const mockMessage = {
			id: "msg-1",
			conversation: "conv-1",
			sender: "user-1",
			content: "Hello!",
			createdAt: "2026-03-08T10:00:00Z",
		};

		globalThis.fetch = mockFetch((_url, opts) => {
			if (opts?.method === "POST") {
				return Promise.resolve(
					new Response(JSON.stringify({ doc: mockMessage }), {
						status: 201,
					}),
				);
			}
			return Promise.resolve(new Response("OK", { status: 200 }));
		});

		const handler = handlers.get("message:send")!;
		handler({ conversationId: "conv-1", content: "Hello!", tempId: "temp-1" });

		// Wait for async persist
		await new Promise((r) => setTimeout(r, 50));

		const roomMsg = emittedToIoRoom.find((e) => e.event === "message:new");
		expect(roomMsg).toBeDefined();
		expect(roomMsg?.data.sender).toBe("user-1");
		expect(roomMsg?.data.content).toBe("Hello!");

		const confirmed = socketEmitted.find(
			(e) => e.event === "message:confirmed",
		);
		expect(confirmed).toBeDefined();
		expect(confirmed?.data.tempId).toBe("temp-1");
		expect(confirmed?.data.message.id).toBe("msg-1");
	});

	test("emits message:failed when conversationId is missing and tempId provided", async () => {
		const { socket, io, handlers, socketEmitted } = createMockSocketAndIo();
		registerMessageHandlers(io as never, socket as never, "user-1");

		const handler = handlers.get("message:send")!;
		await handler({ conversationId: "", content: "Hello!", tempId: "temp-x" });

		const failed = socketEmitted.find((e) => e.event === "message:failed");
		expect(failed).toBeDefined();
		expect(failed?.data.tempId).toBe("temp-x");
	});

	test("emits message:failed when content is empty and tempId provided", async () => {
		const { socket, io, handlers, socketEmitted } = createMockSocketAndIo();
		registerMessageHandlers(io as never, socket as never, "user-1");

		const handler = handlers.get("message:send")!;
		await handler({
			conversationId: "conv-1",
			content: "   ",
			tempId: "temp-y",
		});

		const failed = socketEmitted.find((e) => e.event === "message:failed");
		expect(failed).toBeDefined();
		expect(failed?.data.tempId).toBe("temp-y");
	});

	test("emits message:failed when rate limit is exceeded and tempId provided", async () => {
		const { socket, io, handlers, socketEmitted } = createMockSocketAndIo();
		registerMessageHandlers(io as never, socket as never, "user-1");

		rateLimitCounter = 5;
		mockRedis.incr.mockImplementation(() => {
			rateLimitCounter++;
			return Promise.resolve(rateLimitCounter);
		});

		const handler = handlers.get("message:send")!;
		await handler({
			conversationId: "conv-1",
			content: "spam",
			tempId: "temp-z",
		});

		const failed = socketEmitted.find((e) => e.event === "message:failed");
		expect(failed).toBeDefined();
		expect(failed?.data.error).toContain("Rate limit");
	});

	test("emits message:failed on persistence failure", async () => {
		const { socket, io, handlers, socketEmitted } = createMockSocketAndIo();
		registerMessageHandlers(io as never, socket as never, "user-1");

		globalThis.fetch = mockFetch(() =>
			Promise.resolve(new Response("Internal Server Error", { status: 500 })),
		);

		const handler = handlers.get("message:send")!;
		handler({
			conversationId: "conv-1",
			content: "Hello!",
			tempId: "temp-fail",
		});

		await new Promise((r) => setTimeout(r, 50));

		const failed = socketEmitted.find((e) => e.event === "message:failed");
		expect(failed).toBeDefined();
		expect(failed?.data.tempId).toBe("temp-fail");
	});

	test("works without tempId (no confirmed/failed events expected)", async () => {
		const { socket, io, handlers, socketEmitted, emittedToIoRoom } =
			createMockSocketAndIo();
		registerMessageHandlers(io as never, socket as never, "user-1");

		const mockMessage = {
			id: "msg-2",
			conversation: "conv-1",
			sender: "user-1",
			content: "No tempId",
			createdAt: "2026-03-08T10:00:00Z",
		};

		globalThis.fetch = mockFetch(() =>
			Promise.resolve(
				new Response(JSON.stringify({ doc: mockMessage }), { status: 201 }),
			),
		);

		const handler = handlers.get("message:send")!;
		handler({ conversationId: "conv-1", content: "No tempId" });

		await new Promise((r) => setTimeout(r, 50));

		const roomMsg = emittedToIoRoom.find((e) => e.event === "message:new");
		expect(roomMsg).toBeDefined();

		const confirmed = socketEmitted.find(
			(e) => e.event === "message:confirmed",
		);
		expect(confirmed).toBeUndefined();
	});

	test("refuses message:send when the sender has no access to the conversation", async () => {
		(hasConversationAccess as ReturnType<typeof mock>).mockResolvedValue(false);
		const { socket, io, handlers, socketEmitted } = createMockSocketAndIo();
		registerMessageHandlers(io as never, socket as never, "user-9");
		await handlers.get("message:send")?.({
			conversationId: "conv-1",
			content: "hello",
			tempId: "tmp-1",
		});
		expect(socketEmitted).toEqual([
			{
				event: "message:failed",
				data: { tempId: "tmp-1", error: "Access denied to conversation" },
			},
		]);
	});

	test("checks access before it counts against the rate limit", async () => {
		(hasConversationAccess as ReturnType<typeof mock>).mockResolvedValue(false);
		const { socket, io, handlers } = createMockSocketAndIo();
		registerMessageHandlers(io as never, socket as never, "user-9");
		mockRedis.incr.mockClear();
		await handlers.get("message:send")?.({
			conversationId: "conv-1",
			content: "x",
			tempId: "t",
		});
		expect(mockRedis.incr).not.toHaveBeenCalled();
	});

	test("broadcasts a shop conversation to the shop-inbox room as well", async () => {
		(hasConversationAccess as ReturnType<typeof mock>).mockResolvedValue(true);
		(getConversationMeta as ReturnType<typeof mock>).mockResolvedValue({
			participants: ["u-buyer", "u-owner"],
			shopId: "s-1",
		});
		globalThis.fetch = mockFetch(
			async () =>
				new Response(
					JSON.stringify({
						doc: {
							id: "msg-1",
							content: "hello",
							createdAt: "2026-10-01T00:00:00.000Z",
						},
					}),
					{ status: 200 },
				),
		);
		const { socket, io, handlers, emittedToIoRoom } = createMockSocketAndIo();
		registerMessageHandlers(io as never, socket as never, "u-buyer");
		await handlers.get("message:send")?.({
			conversationId: "conv-1",
			content: "hello",
		});
		await Bun.sleep(10);
		expect(emittedToIoRoom.map((entry) => entry.room)).toContain(
			"shop-inbox:s-1",
		);
	});

	test("message:read calls the read route once, not one PATCH per message", async () => {
		const calls: Array<{ url: string; method?: string; body?: string }> = [];
		globalThis.fetch = mockFetch(async (url, init) => {
			calls.push({
				url: String(url),
				method: init?.method,
				body: String(init?.body ?? ""),
			});
			return new Response(JSON.stringify({ lastReadAt: "x", unreadCount: 0 }), {
				status: 200,
			});
		});
		const { socket, io, handlers } = createMockSocketAndIo();
		registerMessageHandlers(io as never, socket as never, "u-staff");
		handlers.get("message:read")?.({
			conversationId: "conv-1",
			messageIds: ["m-1", "m-2", "m-3"],
		});
		await Bun.sleep(10);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toContain("/conversations/conv-1/read");
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
			lastMessageId: "m-3",
			userId: "u-staff",
		});
	});
});

describe("message:delivered", () => {
	test("emits delivery confirmation to the room", () => {
		const { socket, io, handlers, emittedToRoom } = createMockSocketAndIo();
		registerMessageHandlers(io as never, socket as never, "user-1");

		const handler = handlers.get("message:delivered")!;
		handler({ conversationId: "conv-1", messageId: "msg-100" });

		expect(emittedToRoom.length).toBe(1);
		expect(emittedToRoom[0]?.event).toBe("message:delivered");
		expect(emittedToRoom[0]?.data.messageId).toBe("msg-100");
		expect(emittedToRoom[0]?.data.userId).toBe("user-1");
	});
});

describe("message:read", () => {
	test("emits read confirmation to the room", async () => {
		const { socket, io, handlers, emittedToRoom } = createMockSocketAndIo();
		registerMessageHandlers(io as never, socket as never, "user-1");

		globalThis.fetch = mockFetch(
			async () =>
				new Response(JSON.stringify({ lastReadAt: "x", unreadCount: 0 }), {
					status: 200,
				}),
		);

		const handler = handlers.get("message:read")!;
		handler({ conversationId: "conv-1", messageIds: ["msg-1", "msg-2"] });

		expect(emittedToRoom.length).toBe(1);
		expect(emittedToRoom[0]?.event).toBe("message:read");
		expect(emittedToRoom[0]?.data.messageIds).toEqual(["msg-1", "msg-2"]);

		await new Promise((r) => setTimeout(r, 50));
	});
});
