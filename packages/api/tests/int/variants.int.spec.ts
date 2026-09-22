// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	availableOf,
	combinationKey,
	crossedLowStock,
	generateCombinations,
	isLowStock,
	isOutOfStock,
	marginPercent,
	summarizeVariants,
	variantLabel,
} from "../../src/lib/variants";

describe("generateCombinations", () => {
	it("returns one empty combination without options", () => {
		expect(generateCombinations([])).toEqual([{}]);
	});

	it("crosses every option value in option order", () => {
		expect(
			generateCombinations([
				{ name: "Couleur", values: ["Noir", "Violet"] },
				{ name: "Stockage", values: ["256 Go"] },
			]),
		).toEqual([
			{ Couleur: "Noir", Stockage: "256 Go" },
			{ Couleur: "Violet", Stockage: "256 Go" },
		]);
	});
});

describe("labels and keys", () => {
	it("joins values with a middle dot", () => {
		expect(variantLabel({ Couleur: "Graphite", Stockage: "256 Go" })).toBe(
			"Graphite · 256 Go",
		);
		expect(variantLabel({})).toBe("");
		expect(variantLabel(null)).toBe("");
	});

	it("builds a key that ignores property order", () => {
		const options = [
			{ name: "A", values: ["1"] },
			{ name: "B", values: ["2"] },
		];
		expect(combinationKey({ B: "2", A: "1" }, options)).toBe(
			combinationKey({ A: "1", B: "2" }, options),
		);
	});
});

describe("stock arithmetic", () => {
	const v = (
		stockOnHand: number,
		lowStockThreshold: number | null = 1,
		trackInventory = true,
	) => ({
		stockOnHand,
		stockReserved: 0,
		lowStockThreshold,
		trackInventory,
		price: 1,
	});

	it("computes availability without going negative", () => {
		expect(availableOf({ stockOnHand: 3, stockReserved: 1 })).toBe(2);
		expect(availableOf({ stockOnHand: 0, stockReserved: 1 })).toBe(0);
	});

	it("flags low and out-of-stock tracked variants only", () => {
		expect(isLowStock(v(1))).toBe(true);
		expect(isLowStock(v(2))).toBe(false);
		expect(isLowStock(v(0))).toBe(false);
		expect(isOutOfStock(v(0))).toBe(true);
		expect(isOutOfStock(v(0, 1, false))).toBe(false);
		expect(isLowStock(v(1, null))).toBe(false);
	});

	it("detects a crossing only when going from above to at-or-below", () => {
		expect(crossedLowStock(2, 1, 1)).toBe(true);
		expect(crossedLowStock(1, 0, 1)).toBe(false);
		expect(crossedLowStock(5, 3, 1)).toBe(false);
		expect(crossedLowStock(2, 1, null)).toBe(false);
	});
});

describe("summarizeVariants", () => {
	it("ignores archived variants and sums tracked stock", () => {
		expect(
			summarizeVariants([
				{
					price: 285000,
					stockOnHand: 4,
					stockReserved: 0,
					trackInventory: true,
				},
				{
					price: 330000,
					stockOnHand: 2,
					stockReserved: 0,
					trackInventory: true,
				},
				{
					price: 100,
					stockOnHand: 9,
					trackInventory: true,
					archivedAt: "2026-01-01",
				},
			]),
		).toEqual({
			priceMin: 285000,
			priceMax: 330000,
			available: 6,
			stockOnHand: 6,
			variantCount: 2,
			trackInventory: true,
		});
	});

	it("reports null availability when nothing is tracked", () => {
		expect(
			summarizeVariants([
				{ price: 9000, stockOnHand: 0, trackInventory: false },
			]).available,
		).toBeNull();
	});
});

describe("marginPercent", () => {
	it("rounds to one decimal", () => {
		expect(marginPercent(435000, 382000)).toBe(12.2);
		expect(marginPercent(285000, 238000)).toBe(16.5);
	});

	it("is null without a cost or a price", () => {
		expect(marginPercent(1000, null)).toBeNull();
		expect(marginPercent(0, 10)).toBeNull();
	});
});
