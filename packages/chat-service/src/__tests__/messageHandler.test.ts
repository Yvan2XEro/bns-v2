import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

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
	getParticipants: mock(() => Promise.resolve(["user-1", "user-2"])),
	hasConversationAccess: mock(() => Promise.resolve(true)),
	verifyTokenCached: mock(() => Promise.resolve({ userId: "user-1" })),
	invalidateParticipants: mock(() => Promise.resolve()),
}));

mock.module("../serviceAuth.ts", () => ({
	getServiceToken: mock(() => Promise.resolve("service-token")),
	invalidateServiceToken: mock(() => {}),
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

		registerMessageHandlers(io as any, socket as any, "user-1");

		expect(handlers.has("message:send")).toBe(true);
		expect(handlers.has("message:delivered")).toBe(true);
		expect(handlers.has("message:read")).toBe(true);
	});
});

describe("message:send", () => {
	test("persists message and emits message:new to room on success", async () => {
		const { socket, io, handlers, socketEmitted, emittedToIoRoom } =
			createMockSocketAndIo();
		registerMessageHandlers(io as any, socket as any, "user-1");

		const mockMessage = {
			id: "msg-1",
			conversation: "conv-1",
			sender: "user-1",
			content: "Hello!",
			createdAt: "2026-03-08T10:00:00Z",
		};

		globalThis.fetch = mock((_url: string, opts?: RequestInit) => {
			if (opts?.method === "POST") {
				return Promise.resolve(
					new Response(JSON.stringify({ doc: mockMessage }), {
						status: 201,
					}),
				);
			}
			return Promise.resolve(new Response("OK", { status: 200 }));
		}) as unknown as typeof fetch;

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
		registerMessageHandlers(io as any, socket as any, "user-1");

		const handler = handlers.get("message:send")!;
		await handler({ conversationId: "", content: "Hello!", tempId: "temp-x" });

		const failed = socketEmitted.find((e) => e.event === "message:failed");
		expect(failed).toBeDefined();
		expect(failed?.data.tempId).toBe("temp-x");
	});

	test("emits message:failed when content is empty and tempId provided", async () => {
		const { socket, io, handlers, socketEmitted } = createMockSocketAndIo();
		registerMessageHandlers(io as any, socket as any, "user-1");

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
		registerMessageHandlers(io as any, socket as any, "user-1");

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
		registerMessageHandlers(io as any, socket as any, "user-1");

		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("Internal Server Error", { status: 500 })),
		) as unknown as typeof fetch;

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
		registerMessageHandlers(io as any, socket as any, "user-1");

		const mockMessage = {
			id: "msg-2",
			conversation: "conv-1",
			sender: "user-1",
			content: "No tempId",
			createdAt: "2026-03-08T10:00:00Z",
		};

		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ doc: mockMessage }), { status: 201 }),
			),
		) as unknown as typeof fetch;

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
});

describe("message:delivered", () => {
	test("emits delivery confirmation to the room", () => {
		const { socket, io, handlers, emittedToRoom } = createMockSocketAndIo();
		registerMessageHandlers(io as any, socket as any, "user-1");

		const handler = handlers.get("message:delivered")!;
		handler({ conversationId: "conv-1", messageId: "msg-100" });

		expect(emittedToRoom.length).toBe(1);
		expect(emittedToRoom[0]?.event).toBe("message:delivered");
		expect(emittedToRoom[0]?.data.messageId).toBe("msg-100");
		expect(emittedToRoom[0]?.data.userId).toBe("user-1");
	});
});

describe("message:read", () => {
	test("emits read confirmation and patches messages via service token", async () => {
		const { socket, io, handlers, emittedToRoom } = createMockSocketAndIo();
		registerMessageHandlers(io as any, socket as any, "user-1");

		const patchCalls: string[] = [];
		globalThis.fetch = mock((url: string, opts?: RequestInit) => {
			if (opts?.method === "PATCH") {
				patchCalls.push(url as string);
			}
			return Promise.resolve(new Response("OK", { status: 200 }));
		}) as unknown as typeof fetch;

		const handler = handlers.get("message:read")!;
		handler({ conversationId: "conv-1", messageIds: ["msg-1", "msg-2"] });

		expect(emittedToRoom.length).toBe(1);
		expect(emittedToRoom[0]?.event).toBe("message:read");
		expect(emittedToRoom[0]?.data.messageIds).toEqual(["msg-1", "msg-2"]);

		// Wait for fire-and-forget PATCH calls
		await new Promise((r) => setTimeout(r, 50));
		expect(patchCalls.length).toBe(2);
		expect(patchCalls.some((u) => u.includes("/msg-1"))).toBe(true);
		expect(patchCalls.some((u) => u.includes("/msg-2"))).toBe(true);
	});
});
