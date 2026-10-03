import { describe, expect, test } from "bun:test";
import { showsOrdersTile, visibleSellerTiles } from "./sellerTiles";

const counts = { inboxUnread: 4, lowStock: 2 };

describe("visibleSellerTiles", () => {
	test("gives an owner every tile", () => {
		expect(visibleSellerTiles("owner", counts).map((t) => t.key)).toEqual([
			"catalogue",
			"stock",
			"inbox",
			"team",
			"activity",
			"settings",
			"verification",
		]);
	});

	test("hides verification from a manager, who cannot submit it", () => {
		expect(
			visibleSellerTiles("manager", counts).map((t) => t.key),
		).not.toContain("verification");
	});

	test("gives a staff member only the catalogue, stock, inbox and team tiles", () => {
		expect(visibleSellerTiles("staff", counts).map((t) => t.key)).toEqual([
			"catalogue",
			"stock",
			"inbox",
			"team",
		]);
	});

	test("gives someone with no role nothing", () => {
		expect(visibleSellerTiles(null, counts)).toEqual([]);
	});

	test("carries the unread badge on the inbox tile and the low-stock badge on stock", () => {
		const tiles = visibleSellerTiles("owner", counts);
		expect(tiles.find((t) => t.key === "inbox")?.badge).toBe(4);
		expect(tiles.find((t) => t.key === "stock")?.badge).toBe(2);
	});

	test("omits a zero badge rather than rendering a zero", () => {
		const tiles = visibleSellerTiles("owner", { inboxUnread: 0, lowStock: 0 });
		expect(tiles.find((t) => t.key === "inbox")?.badge).toBeUndefined();
		expect(tiles.find((t) => t.key === "stock")?.badge).toBeUndefined();
	});
});

describe("the order tiles", () => {
	const on = { ordersEnabled: true };

	test("join the hub for an owner once ordering is on, orders first", () => {
		expect(visibleSellerTiles("owner", counts, on).map((t) => t.key)).toEqual([
			"orders",
			"catalogue",
			"stock",
			"inbox",
			"billing",
			"payments",
			"team",
			"activity",
			"settings",
			"verification",
		]);
	});

	test("stay out while ordering is off, whatever the role", () => {
		const keys = visibleSellerTiles("owner", counts, {
			ordersEnabled: false,
		}).map((t) => t.key);
		expect(keys).not.toContain("orders");
		expect(keys).not.toContain("billing");
		expect(keys).not.toContain("payments");
		expect(keys).toHaveLength(7);
	});

	test("give staff the orders tile but not billing, which needs payments.view", () => {
		const keys = visibleSellerTiles("staff", counts, on).map((t) => t.key);
		expect(keys).toEqual(["orders", "catalogue", "stock", "inbox", "team"]);
	});

	test("carry the to-accept count as the orders badge, and no zero", () => {
		expect(
			visibleSellerTiles("owner", { ...counts, toAccept: 3 }, on).find(
				(t) => t.key === "orders",
			)?.badge,
		).toBe(3);
		expect(
			visibleSellerTiles("owner", { ...counts, toAccept: 0 }, on).find(
				(t) => t.key === "orders",
			)?.badge,
		).toBeUndefined();
	});

	test("point at the order, billing and payments screens", () => {
		const tiles = visibleSellerTiles("owner", counts, on);
		expect(tiles.find((t) => t.key === "orders")?.href).toBe("/seller/orders");
		expect(tiles.find((t) => t.key === "billing")?.href).toBe(
			"/seller/billing",
		);
		expect(tiles.find((t) => t.key === "payments")?.href).toBe(
			"/seller/payments",
		);
	});

	test("carries the holds count as the payments badge, and no zero", () => {
		expect(
			visibleSellerTiles("owner", { ...counts, paymentsHolds: 2 }, on).find(
				(t) => t.key === "payments",
			)?.badge,
		).toBe(2);
		expect(
			visibleSellerTiles("owner", { ...counts, paymentsHolds: 0 }, on).find(
				(t) => t.key === "payments",
			)?.badge,
		).toBeUndefined();
	});

	test("read the order list only when the orders tile shows", () => {
		expect(showsOrdersTile("staff", true)).toBe(true);
		expect(showsOrdersTile("owner", false)).toBe(false);
		expect(showsOrdersTile(null, true)).toBe(false);
	});
});
