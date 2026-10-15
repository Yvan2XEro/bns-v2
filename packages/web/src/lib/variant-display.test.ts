import { describe, expect, it } from "bun:test";
import {
	colourSwatch,
	isColourOption,
	isPaleSwatch,
	optionValuePrice,
	stockStatus,
} from "./variant-display";

describe("colour swatches", () => {
	it("recognises a colour option in French and English", () => {
		expect(isColourOption("Couleur")).toBe(true);
		expect(isColourOption(" colors ")).toBe(true);
		expect(isColourOption("Stockage")).toBe(false);
	});

	it("maps common names, accents and compound names", () => {
		expect(colourSwatch("Graphite")).toBe("#475569");
		expect(colourSwatch("Doré")).toBe("#fde68a");
		expect(colourSwatch("Bleu nuit")).toBe("#2563eb");
		expect(colourSwatch("#ff0000")).toBe("#ff0000");
	});

	it("falls back to text for an unknown name", () => {
		expect(colourSwatch("Sierra")).toBeNull();
	});

	it("outlines only pale swatches", () => {
		expect(isPaleSwatch("#ffffff")).toBe(true);
		expect(isPaleSwatch("#e2e8f0")).toBe(true);
		expect(isPaleSwatch("#475569")).toBe(false);
	});
});

describe("stockStatus", () => {
	it("gives the count only when tracked and sent", () => {
		expect(
			stockStatus({ available: true, trackInventory: true, availableCount: 3 }),
		).toEqual({ kind: "inStock", count: 3 });
		expect(
			stockStatus({
				available: true,
				trackInventory: true,
				availableCount: null,
			}),
		).toEqual({ kind: "inStock", count: null });
		expect(stockStatus({ available: true, trackInventory: false })).toEqual({
			kind: "inStock",
			count: null,
		});
	});

	it("reports sold out", () => {
		expect(
			stockStatus({
				available: false,
				trackInventory: true,
				availableCount: 0,
			}),
		).toEqual({ kind: "soldOut" });
	});
});

describe("optionValuePrice", () => {
	const variants = [
		{ optionValues: { Stockage: "256 Go" }, price: 285000, available: true },
		{ optionValues: { Stockage: "512 Go" }, price: 330000, available: true },
		{ optionValues: { Stockage: "1 To" }, price: 285000, available: true },
	];
	const selected = { Stockage: "256 Go" };

	it("shows the price a value moves to when it differs", () => {
		expect(optionValuePrice(variants, selected, "Stockage", "512 Go")).toBe(
			330000,
		);
	});

	it("is null for the selected value and for an equal price", () => {
		expect(
			optionValuePrice(variants, selected, "Stockage", "256 Go"),
		).toBeNull();
		expect(optionValuePrice(variants, selected, "Stockage", "1 To")).toBeNull();
	});
});
