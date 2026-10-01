import { describe, expect, test } from "bun:test";
import { visibleSellerTiles } from "./sellerTiles";

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
