import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

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
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function createMockSocketAndIo() {
	const handlers = new Map<string, Function>();
	const emittedToRoom: Array<{ room: string; event: string; data: any }> =
		[];
	const emittedToIoRoom: Array<{
		room: string;
		event: string;
		data: any;
	}> = [];

	const socket = {
		on: mock((event: string, handler: Function) => {
			handlers.set(event, handler);
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

	return { socket, io, handlers, emittedToRoom, emittedToIoRoom };
}

describe("registerMessageHandlers", () => {
	test("registers message:send, message:delivered, and message:read handlers", () => {
		const { socket, io, handlers } = createMockSocketAndIo();

		registerMessageHandlers(io as any, socket as any, "user-1", "tok");

		expect(handlers.has("message:send")).toBe(true);
		expect(handlers.has("message:delivered")).toBe(true);
		expect(handlers.has("message:read")).toBe(true);
	});
});

describe("message:send", () => {
	test("persists message and emits to room on success", async () => {
		const { socket, io, handlers, emittedToIoRoom } =
			createMockSocketAndIo();
		registerMessageHandlers(io as any, socket as any, "user-1", "tok");

		const mockMessage = {
			id: "msg-1",
			conversation: "conv-1",
			sender: "user-1",
			content: "Hello!",
			createdAt: "2026-03-08T10:00:00Z",
		};

		globalThis.fetch = mock((url: string, opts?: RequestInit) => {
			if (opts?.method === "POST") {
				return Promise.resolve(
					new Response(JSON.stringify({ doc: mockMessage }), {
						status: 201,
					}),
				);
			}
			return Promise.resolve(new Response("OK", { status: 200 }));
		}) as typeof fetch;

		const ack = mock(() => {});
		const handler = handlers.get("message:send")!;
		await handler(
			{ conversationId: "conv-1", content: "Hello!" },
			ack,
		);

		expect(ack).toHaveBeenCalledTimes(1);
		const ackArg = (ack.mock.calls[0] as any[])[0];
		expect(ackArg.success).toBe(true);
		expect(ackArg.message.id).toBe("msg-1");

		expect(emittedToIoRoom.length).toBeGreaterThanOrEqual(1);
		const emitted = emittedToIoRoom.find(
			(e) => e.event === "message:new",
		);
		expect(emitted).toBeDefined();
		expect(emitted!.data.sender).toBe("user-1");
		expect(emitted!.data.content).toBe("Hello!");
	});

	test("rejects when conversationId is missing", async () => {
		const { socket, io, handlers } = createMockSocketAndIo();
		registerMessageHandlers(io as any, socket as any, "user-1", "tok");

		const ack = mock(() => {});
		const handler = handlers.get("message:send")!;
		await handler({ conversationId: "", content: "Hello!" }, ack);

		const ackArg = (ack.mock.calls[0] as any[])[0];
		expect(ackArg.success).toBe(false);
		expect(ackArg.error).toContain("Missing");
	});

	test("rejects when content is empty", async () => {
		const { socket, io, handlers } = createMockSocketAndIo();
		registerMessageHandlers(io as any, socket as any, "user-1", "tok");

		const ack = mock(() => {});
		const handler = handlers.get("message:send")!;
		await handler({ conversationId: "conv-1", content: "   " }, ack);

		const ackArg = (ack.mock.calls[0] as any[])[0];
		expect(ackArg.success).toBe(false);
		expect(ackArg.error).toContain("Missing");
	});

	test("rejects when rate limit is exceeded", async () => {
		const { socket, io, handlers } = createMockSocketAndIo();
		registerMessageHandlers(io as any, socket as any, "user-1", "tok");

		rateLimitCounter = 5;
		mockRedis.incr.mockImplementation(() => {
			rateLimitCounter++;
			return Promise.resolve(rateLimitCounter);
		});

		const ack = mock(() => {});
		const handler = handlers.get("message:send")!;
		await handler({ conversationId: "conv-1", content: "spam" }, ack);

		const ackArg = (ack.mock.calls[0] as any[])[0];
		expect(ackArg.success).toBe(false);
		expect(ackArg.error).toContain("Rate limit");
	});

	test("handles persistence failure gracefully", async () => {
		const { socket, io, handlers } = createMockSocketAndIo();
		registerMessageHandlers(io as any, socket as any, "user-1", "tok");

		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response("Internal Server Error", { status: 500 }),
			),
		) as typeof fetch;

		const ack = mock(() => {});
		const handler = handlers.get("message:send")!;
		await handler(
			{ conversationId: "conv-1", content: "Hello!" },
			ack,
		);

		const ackArg = (ack.mock.calls[0] as any[])[0];
		expect(ackArg.success).toBe(false);
		expect(ackArg.error).toContain("Failed to send message");
	});

	test("works without ack callback", async () => {
		const { socket, io, handlers } = createMockSocketAndIo();
		registerMessageHandlers(io as any, socket as any, "user-1", "tok");

		const mockMessage = {
			id: "msg-2",
			conversation: "conv-1",
			sender: "user-1",
			content: "No ack",
			createdAt: "2026-03-08T10:00:00Z",
		};

		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ doc: mockMessage }), {
					status: 201,
				}),
			),
		) as typeof fetch;

		const handler = handlers.get("message:send")!;
		// Should not throw when called without ack
		await handler({ conversationId: "conv-1", content: "No ack" });
	});
});

describe("message:delivered", () => {
	test("emits delivery confirmation to the room", async () => {
		const { socket, io, handlers, emittedToRoom } =
			createMockSocketAndIo();
		registerMessageHandlers(io as any, socket as any, "user-1", "tok");

		const handler = handlers.get("message:delivered")!;
		await handler({
			conversationId: "conv-1",
			messageId: "msg-100",
		});

		expect(emittedToRoom.length).toBe(1);
		expect(emittedToRoom[0]!.event).toBe("message:delivered");
		expect(emittedToRoom[0]!.data.messageId).toBe("msg-100");
		expect(emittedToRoom[0]!.data.userId).toBe("user-1");
	});
});

describe("message:read", () => {
	test("emits read confirmation and patches messages via API", async () => {
		const { socket, io, handlers, emittedToRoom } =
			createMockSocketAndIo();
		registerMessageHandlers(io as any, socket as any, "user-1", "tok");

		const patchCalls: string[] = [];
		globalThis.fetch = mock((url: string, opts?: RequestInit) => {
			if (opts?.method === "PATCH") {
				patchCalls.push(url);
			}
			return Promise.resolve(new Response("OK", { status: 200 }));
		}) as typeof fetch;

		const handler = handlers.get("message:read")!;
		await handler({
			conversationId: "conv-1",
			messageIds: ["msg-1", "msg-2"],
		});

		expect(emittedToRoom.length).toBe(1);
		expect(emittedToRoom[0]!.event).toBe("message:read");
		expect(emittedToRoom[0]!.data.messageIds).toEqual([
			"msg-1",
			"msg-2",
		]);

		// Wait for fire-and-forget PATCH calls
		await new Promise((r) => setTimeout(r, 50));
		expect(patchCalls.length).toBe(2);
		expect(patchCalls.some((u) => u.includes("/msg-1"))).toBe(true);
		expect(patchCalls.some((u) => u.includes("/msg-2"))).toBe(true);
	});
});
