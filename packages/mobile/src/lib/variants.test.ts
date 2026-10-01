import { describe, expect, test } from "bun:test";
import {
	formatXaf,
	formatXafRange,
	generateCombinations,
	isShopOwner,
	marginPercent,
	priceRange,
	variantLabel,
} from "./variants";

describe("generateCombinations", () => {
	test("returns a single empty combination without options", () => {
		expect(generateCombinations([])).toEqual([{}]);
	});

	test("builds the cartesian product in option order", () => {
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

	test("ignores options without values and blank values", () => {
		expect(
			generateCombinations([
				{ name: "Couleur", values: ["Noir", " "] },
				{ name: "Taille", values: [] },
			]),
		).toEqual([{ Couleur: "Noir" }]);
	});
});

describe("variantLabel", () => {
	const options = [
		{ name: "Couleur", values: ["Graphite"] },
		{ name: "Stockage", values: ["256 Go"] },
	];

	test("joins values in option order", () => {
		expect(
			variantLabel({ Stockage: "256 Go", Couleur: "Graphite" }, options),
		).toBe("Graphite · 256 Go");
	});

	test("returns an empty label for the default variant", () => {
		expect(variantLabel({})).toBe("");
	});
});

describe("marginPercent", () => {
	test("computes the margin on the selling price, one decimal", () => {
		expect(marginPercent(435000, 382000)).toBe(12.2);
		expect(marginPercent(285000, 238000)).toBe(16.5);
	});

	test("is null without a cost or a price", () => {
		expect(marginPercent(435000, null)).toBeNull();
		expect(marginPercent(0, 100)).toBeNull();
	});
});

describe("priceRange", () => {
	test("returns min and max", () => {
		expect(priceRange([330000, 285000, 285000])).toEqual({
			min: 285000,
			max: 330000,
		});
	});

	test("is null for an empty list", () => {
		expect(priceRange([])).toBeNull();
	});
});

describe("formatXaf", () => {
	test("groups thousands with a space in French", () => {
		expect(formatXaf(435000)).toBe("435 000 XAF");
	});

	test("groups thousands with a comma in English", () => {
		expect(formatXaf(169200, "en")).toBe("169,200 XAF");
	});

	test("collapses a range whose ends are equal", () => {
		expect(formatXafRange(285000, 330000)).toBe("285 000 – 330 000 XAF");
		expect(formatXafRange(9000, 9000)).toBe("9 000 XAF");
	});
});

describe("isShopOwner", () => {
	test("only the owner passes", () => {
		expect(isShopOwner("owner")).toBe(true);
	});

	test("a manager, staff or no role does not", () => {
		expect(isShopOwner("manager")).toBe(false);
		expect(isShopOwner("staff")).toBe(false);
		expect(isShopOwner(null)).toBe(false);
		expect(isShopOwner(undefined)).toBe(false);
	});
});
