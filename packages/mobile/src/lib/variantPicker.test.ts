import { describe, expect, test } from "bun:test";
import type { PublicVariantDoc } from "../types/api";
import {
	initialSelection,
	isOptionValueUnavailable,
	isVariantInStock,
	matchVariant,
	resolveSelection,
} from "./variantPicker";

function variant(
	id: string,
	optionValues: Record<string, string>,
	available: boolean,
	trackInventory = true,
): PublicVariantDoc {
	return { id, optionValues, price: 285000, trackInventory, available };
}

const OPTIONS = [
	{ name: "Couleur", values: ["Graphite", "Argent"] },
	{ name: "Stockage", values: ["256 Go", "512 Go"] },
];

// "a" (Graphite/256) is sold out, "b" (Argent/256) is in stock, "c"
// (Argent/512) is sold out. Graphite/512 is not a variant at all.
const VARIANTS = [
	variant("a", { Couleur: "Graphite", Stockage: "256 Go" }, false),
	variant("b", { Couleur: "Argent", Stockage: "256 Go" }, true),
	variant("c", { Couleur: "Argent", Stockage: "512 Go" }, false),
];

describe("isVariantInStock", () => {
	test("reads the server-derived `available` boolean as-is", () => {
		expect(isVariantInStock(VARIANTS[0])).toBe(false);
		expect(isVariantInStock(VARIANTS[1])).toBe(true);
	});

	test("an untracked variant is always in stock, per its own `available`", () => {
		expect(isVariantInStock(variant("d", {}, true, false))).toBe(true);
	});
});

describe("matchVariant", () => {
	test("finds the variant matching every option", () => {
		expect(
			matchVariant(VARIANTS, { Couleur: "Argent", Stockage: "512 Go" })?.id,
		).toBe("c");
	});

	test("returns null for a combination no variant carries", () => {
		expect(
			matchVariant(VARIANTS, { Couleur: "Graphite", Stockage: "512 Go" }),
		).toBeNull();
	});
});

describe("initialSelection", () => {
	test("starts on the first variant in stock", () => {
		expect(initialSelection(VARIANTS, OPTIONS)).toEqual({
			Couleur: "Argent",
			Stockage: "256 Go",
		});
	});

	test("falls back to the first variant when nothing is in stock", () => {
		const allOut = VARIANTS.map((v) => ({ ...v, available: false }));
		expect(initialSelection(allOut, OPTIONS)).toEqual({
			Couleur: "Graphite",
			Stockage: "256 Go",
		});
	});

	test("falls back to the first value of each option when there are no variants", () => {
		expect(initialSelection([], OPTIONS)).toEqual({
			Couleur: "Graphite",
			Stockage: "256 Go",
		});
	});
});

describe("isOptionValueUnavailable — real disabled state, not selection-dependent", () => {
	test("a value is available when some in-stock variant carries it, regardless of it needing a resolve", () => {
		// 512 Go only exists sold out (variant c) — genuinely unavailable.
		expect(isOptionValueUnavailable(VARIANTS, "Stockage", "512 Go")).toBe(true);
		// 256 Go has an in-stock variant (b) — available.
		expect(isOptionValueUnavailable(VARIANTS, "Stockage", "256 Go")).toBe(
			false,
		);
	});

	test("ignores the current selection entirely — same answer whatever is picked elsewhere", () => {
		// Couleur "Argent" is in stock (b) no matter what Stockage is selected.
		expect(isOptionValueUnavailable(VARIANTS, "Couleur", "Argent")).toBe(false);
	});
});

// The Colour x Size regression the brief calls out by name: Red/M is sold
// out, Red/L is in stock. A buyer on Blue/M must be able to reach Red/L by
// tapping "Red" — not be told Red is unavailable, and not be dumped on the
// sold-out Red/M.
describe("resolveSelection — Blue/M to Red/L", () => {
	const CxS = [
		variant("red-m", { Colour: "Red", Size: "M" }, false),
		variant("red-l", { Colour: "Red", Size: "L" }, true),
		variant("blue-m", { Colour: "Blue", Size: "M" }, true),
		variant("blue-l", { Colour: "Blue", Size: "L" }, true),
	];

	test("Red is not disabled, even though Red/M (the exact match for the current Size) is sold out", () => {
		expect(isOptionValueUnavailable(CxS, "Colour", "Red")).toBe(false);
	});

	test("clicking Red from Blue/M resolves to Red/L, not Red/M", () => {
		const next = resolveSelection(
			CxS,
			{ Colour: "Blue", Size: "M" },
			"Colour",
			"Red",
		);
		expect(next).toEqual({ Colour: "Red", Size: "L" });
	});

	test("clicking a value that is exactly in stock keeps the exact combination", () => {
		const next = resolveSelection(
			CxS,
			{ Colour: "Red", Size: "L" },
			"Colour",
			"Blue",
		);
		expect(next).toEqual({ Colour: "Blue", Size: "L" });
	});

	test("clicking a value with no in-stock variant anywhere returns the dead combination as-is", () => {
		const noStock = [
			variant("red-m", { Colour: "Red", Size: "M" }, false),
			variant("blue-m", { Colour: "Blue", Size: "M" }, true),
		];
		const next = resolveSelection(
			noStock,
			{ Colour: "Blue", Size: "M" },
			"Colour",
			"Red",
		);
		expect(next).toEqual({ Colour: "Red", Size: "M" });
	});

	test("among several in-stock candidates, keeps the most of the other selected values", () => {
		const grid = [
			variant("red-m", { Colour: "Red", Size: "M" }, false),
			variant("red-l", { Colour: "Red", Size: "L" }, true),
			variant("red-xl", { Colour: "Red", Size: "XL" }, true),
			variant("blue-l", { Colour: "Blue", Size: "L" }, true),
		];
		// Currently Blue/L. Clicking Red should keep Size "L" (Red/L), not jump to XL.
		const next = resolveSelection(
			grid,
			{ Colour: "Blue", Size: "L" },
			"Colour",
			"Red",
		);
		expect(next).toEqual({ Colour: "Red", Size: "L" });
	});
});
