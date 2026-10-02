import { describe, expect, it } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import {
	isSystemMessage,
	orderCardOf,
	SYSTEM_EVENT_KEYS,
	systemChip,
} from "./system-message";

describe("systemChip", () => {
	it("localises a known event from its key and parameters", () => {
		expect(
			systemChip({
				kind: "system",
				systemEvent: "order.accepted",
				systemParams: { orderNumber: "BNS-2609-000123", total: 47_000 },
				content: "La boutique a accepté la commande BNS-2609-000123.",
			}),
		).toEqual({
			kind: "key",
			key: "system_order_accepted",
			orderNumber: "BNS-2609-000123",
		});
	});

	it("renders an old payload's content", () => {
		expect(
			systemChip({
				kind: "system",
				content: "Commande BNS-2609-000123 passee",
			}),
		).toEqual({ kind: "text", text: "Commande BNS-2609-000123 passee" });
	});

	it("falls back to content for an event this build does not know", () => {
		expect(
			systemChip({
				kind: "system",
				systemEvent: "order.disputed",
				systemParams: { orderNumber: "BNS-1" },
				content: "Litige ouvert.",
			}),
		).toEqual({ kind: "text", text: "Litige ouvert." });
	});

	it("falls back to content when the parameters carry no order number", () => {
		expect(
			systemChip({
				kind: "system",
				systemEvent: "order.shipped",
				systemParams: null,
				content: "Commande expédiée.",
			}),
		).toEqual({ kind: "text", text: "Commande expédiée." });
	});

	it("is no chip for a user message", () => {
		expect(isSystemMessage({ kind: "user", content: "Bonjour" })).toBe(false);
		expect(isSystemMessage({ content: "Bonjour" })).toBe(false);
		expect(isSystemMessage({ kind: "system", content: "x" })).toBe(true);
	});

	it("has a translation in both locales for every event the API posts", () => {
		const events = Object.keys(SYSTEM_EVENT_KEYS);
		expect(events).toHaveLength(10);
		for (const key of Object.values(SYSTEM_EVENT_KEYS)) {
			expect(typeof fr.Messages[key]).toBe("string");
			expect(typeof en.Messages[key]).toBe("string");
		}
	});
});

describe("orderCardOf", () => {
	const placed = {
		kind: "system" as const,
		systemEvent: "order.placed",
		systemParams: { orderNumber: "BNS-2609-000123", total: 47_000 },
		content: "…",
		order: "o-1",
	};

	it("links the buyer to their purchase", () => {
		expect(orderCardOf([{ content: "Bonjour" }, placed], "buyer")).toEqual({
			orderId: "o-1",
			orderNumber: "BNS-2609-000123",
			href: "/purchases/o-1",
		});
	});

	it("links the shop side to the seller order screen", () => {
		expect(
			orderCardOf([{ ...placed, order: { id: "o-1" } }], "shop")?.href,
		).toBe("/seller/orders/o-1");
	});

	it("follows the latest order a thread mentions", () => {
		const next = {
			...placed,
			order: "o-2",
			systemParams: { orderNumber: "BNS-2609-000124" },
		};
		expect(orderCardOf([placed, next], "buyer")?.orderId).toBe("o-2");
	});

	it("is no card for a thread without an order", () => {
		expect(orderCardOf([{ content: "Bonjour" }], "buyer")).toBeNull();
	});
});
