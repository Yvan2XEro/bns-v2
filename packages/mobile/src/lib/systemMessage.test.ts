import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import {
	SYSTEM_EVENT_KEYS,
	systemChip,
	systemMessageOrderPath,
} from "./systemMessage";

type Json = { [key: string]: Json | string };

function lookup(catalogue: Json, path: string): Json | string | undefined {
	return path
		.split(".")
		.reduce<Json | string | undefined>(
			(node, key) => (node && typeof node === "object" ? node[key] : undefined),
			catalogue,
		);
}

const placed = {
	kind: "system",
	systemEvent: "order.placed",
	systemParams: { orderNumber: "BNS-2610-000001", total: 47000 },
	content: "Commande BNS-2610-000001 enregistrée, total 47 000 FCFA.",
	order: "o-1",
};

describe("systemChip", () => {
	test("renders a known event through its key, with the order number", () => {
		expect(systemChip(placed)).toEqual({
			kind: "key",
			key: "messages.system_order_placed",
			orderNumber: "BNS-2610-000001",
		});
	});

	test("falls back to the stored French line for an unknown event", () => {
		expect(systemChip({ ...placed, systemEvent: "order.disputed" })).toEqual({
			kind: "text",
			text: placed.content,
		});
	});

	test("falls back when the params carry no order number", () => {
		expect(systemChip({ ...placed, systemParams: {} })).toEqual({
			kind: "text",
			text: placed.content,
		});
	});

	test("every chip key exists in both locales, with an {{orderNumber}} slot", () => {
		const keys = Object.values(SYSTEM_EVENT_KEYS);
		expect(keys).toHaveLength(10);
		for (const key of keys) {
			for (const catalogue of [en, fr] as Json[]) {
				const copy = lookup(catalogue, key);
				expect(typeof copy).toBe("string");
				expect(String(copy)).toContain("{{orderNumber}}");
			}
		}
	});
});

describe("systemMessageOrderPath", () => {
	test("sends the buyer to their purchase and the shop to its order", () => {
		expect(systemMessageOrderPath(placed, "buyer")).toBe("/purchases/o-1");
		expect(systemMessageOrderPath(placed, "shop")).toBe("/seller/orders/o-1");
	});

	test("reads a populated order too", () => {
		expect(
			systemMessageOrderPath({ ...placed, order: { id: "o-2" } }, "buyer"),
		).toBe("/purchases/o-2");
	});

	test("offers no link for a user message or an order-less system one", () => {
		expect(
			systemMessageOrderPath({ ...placed, kind: "user" }, "buyer"),
		).toBeNull();
		expect(
			systemMessageOrderPath({ ...placed, order: null }, "buyer"),
		).toBeNull();
	});
});
