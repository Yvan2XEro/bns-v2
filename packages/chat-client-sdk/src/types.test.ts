import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "./types";

describe("ChatMessage", () => {
	test("accepts an ordinary user message with no system fields", () => {
		const message: ChatMessage = {
			id: "m-1",
			conversationId: "c-1",
			sender: "u-1",
			content: "bonjour",
			createdAt: "2026-09-15T00:00:00.000Z",
		};
		expect(message.kind).toBeUndefined();
		expect(message.systemEvent).toBeUndefined();
	});

	test("accepts a system message with kind, systemEvent and systemParams, and no real sender", () => {
		const message: ChatMessage = {
			id: "m-2",
			conversationId: "c-1",
			sender: "",
			content: "Commande BNS-2609-000123 confirmée.",
			createdAt: "2026-09-15T00:00:00.000Z",
			kind: "system",
			systemEvent: "order.confirmed",
			systemParams: { orderNumber: "BNS-2609-000123" },
		};
		expect(message.kind).toBe("system");
		expect(message.systemEvent).toBe("order.confirmed");
		expect(message.systemParams).toEqual({ orderNumber: "BNS-2609-000123" });
	});
});
