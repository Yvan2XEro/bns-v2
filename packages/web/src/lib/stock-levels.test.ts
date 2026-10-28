import { describe, expect, test } from "bun:test";
import {
	countStockStates,
	filterStockLevels,
	type StockLevelRow,
	stockLevelsFiltersOf,
	stockStateOf,
} from "./stock-levels";

const row = (patch: Partial<StockLevelRow>): StockLevelRow => ({
	variantId: "v",
	productId: "p",
	productTitle: "AirPods",
	label: "Blanc",
	sku: null,
	onHand: 10,
	reserved: 0,
	available: 10,
	threshold: null,
	state: "ok",
	...patch,
});

describe("stockStateOf", () => {
	const v = (onHand: number, reserved: number, threshold: number | null) => ({
		trackInventory: true,
		stockOnHand: onHand,
		stockReserved: reserved,
		lowStockThreshold: threshold,
	});

	test("reads what buyers can still order, not the shelf", () => {
		expect(stockStateOf(v(3, 3, null))).toBe("out");
		expect(stockStateOf(v(5, 2, 3))).toBe("low");
		expect(stockStateOf(v(10, 2, 3))).toBe("ok");
	});

	test("an untracked variant has no state", () => {
		expect(stockStateOf({ ...v(0, 0, null), trackInventory: false })).toBe(
			"untracked",
		);
	});
});

describe("filterStockLevels", () => {
	const rows = [
		row({ variantId: "a", productTitle: "Zèbre", state: "ok" }),
		row({ variantId: "b", productTitle: "Casque", state: "out", sku: "CQ-1" }),
		row({ variantId: "c", productTitle: "Ampoule", state: "low" }),
	];

	test("shows what needs attention first", () => {
		expect(
			filterStockLevels(rows, { q: "", state: "all" }).map((r) => r.variantId),
		).toEqual(["b", "c", "a"]);
	});

	test("filters by state and searches product, variant and SKU", () => {
		expect(
			filterStockLevels(rows, { q: "", state: "low" }).map((r) => r.variantId),
		).toEqual(["c"]);
		expect(
			filterStockLevels(rows, { q: "cq-", state: "all" }).map(
				(r) => r.variantId,
			),
		).toEqual(["b"]);
	});

	test("counts each state", () => {
		expect(countStockStates(rows)).toEqual({ all: 3, out: 1, low: 1, ok: 1 });
	});
});

describe("stockLevelsFiltersOf", () => {
	test("reads the URL, an unknown state meaning all", () => {
		expect(
			stockLevelsFiltersOf(new URLSearchParams("q=air&state=out")),
		).toEqual({
			q: "air",
			state: "out",
		});
		expect(stockLevelsFiltersOf(new URLSearchParams("state=x")).state).toBe(
			"all",
		);
	});
});
