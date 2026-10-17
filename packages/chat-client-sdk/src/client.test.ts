import { describe, expect, mock, test } from "bun:test";

type Handler = (payload?: unknown) => void;

class FakeSocket {
	connected = false;
	auth: unknown = null;
	handlers = new Map<string, Handler>();
	sent: Array<{ event: string; payload: unknown }> = [];
	on(event: string, handler: Handler) {
		this.handlers.set(event, handler);
		return this;
	}
	emit(event: string, payload: unknown) {
		this.sent.push({ event, payload });
		return this;
	}
	disconnect() {
		this.connected = false;
	}
	fire(event: string, payload?: unknown) {
		if (event === "connect") this.connected = true;
		if (event === "disconnect") this.connected = false;
		this.handlers.get(event)?.(payload);
	}
	sends() {
		return this.sent.filter((s) => s.event === "message:send");
	}
}

let socket = new FakeSocket();
mock.module("socket.io-client", () => ({
	io: () => {
		socket = new FakeSocket();
		return socket;
	},
}));

const { ChatClient } = await import("./client");

function connectedClient() {
	const client = new ChatClient({ url: "http://chat.test", token: "t" });
	client.connect();
	return client;
}

describe("ChatClient outbox", () => {
	test("a message written offline goes out on connect", () => {
		const client = connectedClient();
		const tempId = client.sendMessage({ conversationId: "c1", content: "hi" });
		expect(socket.sends()).toHaveLength(0);
		expect(client.isPending(tempId)).toBe(true);

		socket.fire("connect");
		expect(socket.sends()).toEqual([
			{
				event: "message:send",
				payload: { conversationId: "c1", content: "hi", tempId },
			},
		]);
	});

	test("an unconfirmed message is resent after a reconnect, a confirmed one is not", () => {
		const client = connectedClient();
		socket.fire("connect");
		const kept = client.sendMessage({ conversationId: "c1", content: "a" });
		const done = client.sendMessage({ conversationId: "c1", content: "b" });
		socket.fire("message:confirmed", { tempId: done, message: {} });
		expect(client.isPending(done)).toBe(false);

		socket.fire("disconnect");
		socket.fire("connect");
		const resent = socket
			.sends()
			.slice(2)
			.map((s) => (s.payload as { tempId: string }).tempId);
		expect(resent).toEqual([kept]);
	});

	test("a refused message leaves the outbox and can be retried with its tempId", () => {
		const client = connectedClient();
		socket.fire("connect");
		const tempId = client.sendMessage({ conversationId: "c1", content: "x" });
		socket.fire("message:failed", { tempId, error: "Rate limit exceeded" });
		expect(client.isPending(tempId)).toBe(false);

		expect(
			client.sendMessage({ conversationId: "c1", content: "x", tempId }),
		).toBe(tempId);
		expect(socket.sends()).toHaveLength(2);
	});
});
