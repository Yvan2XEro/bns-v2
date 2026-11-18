import { describe, expect, test } from "bun:test";
import {
	categoryFamily,
	countFormSchema,
	hasAnyInput,
	visibleRowIndexes,
} from "./inventory";

/** A valid row shape, minus `counted`, reused across cases below. */
const baseRow = {
	variantId: "v1",
	productTitle: "T-Shirt",
	label: "M",
	sku: "SKU-1",
	expected: 5,
	cost: null,
};

describe("countFormSchema", () => {
	test("accepts a blank count (not counted yet)", () => {
		const result = countFormSchema.safeParse({
			rows: [{ ...baseRow, counted: "" }],
		});
		expect(result.success).toBe(true);
	});

	test("accepts a plain amount", () => {
		const result = countFormSchema.safeParse({
			rows: [{ ...baseRow, counted: "12" }],
		});
		expect(result.success).toBe(true);
	});

	// Regression guard: a physical keyboard or a paste can put non-numeric,
	// non-blank text into a count field despite inputMode="numeric". The
	// screen only surfaces this to the seller (instead of a "Save the gaps"
	// that silently does nothing) because the schema actually rejects it —
	// if this ever starts passing, the seller-facing fix has gone silent.
	test("rejects non-numeric, non-blank text", () => {
		const result = countFormSchema.safeParse({
			rows: [{ ...baseRow, counted: "abc" }],
		});
		expect(result.success).toBe(false);
	});

	test("rejects the exponent and hex forms parseAmount rejects", () => {
		expect(
			countFormSchema.safeParse({ rows: [{ ...baseRow, counted: "1e6" }] })
				.success,
		).toBe(false);
		expect(
			countFormSchema.safeParse({ rows: [{ ...baseRow, counted: "0x1f" }] })
				.success,
		).toBe(false);
	});
});

describe("hasAnyInput", () => {
	// Regression guard: the submit button is gated on this, not on a
	// successful parse. If it goes back to depending on a valid amount, a
	// row with only garbage text in it makes the button disabled with no way
	// for the seller to ever trigger validation and see why.
	test("is true for a row whose only text is unparseable", () => {
		expect(hasAnyInput([{ counted: "abc" }])).toBe(true);
	});

	test("is true for a row with a valid amount", () => {
		expect(hasAnyInput([{ counted: "12" }])).toBe(true);
	});

	test("is false when every row is blank", () => {
		expect(hasAnyInput([{ counted: "" }, { counted: "   " }])).toBe(false);
	});

	test("is false for an empty list", () => {
		expect(hasAnyInput([])).toBe(false);
	});
});

describe("visibleRowIndexes", () => {
	const rows = [
		{ ...baseRow, categoryId: "c-phones", counted: "5" },
		{
			...baseRow,
			variantId: "v2",
			sku: "AT-2",
			categoryId: "c-watch",
			counted: "",
		},
		{
			...baseRow,
			variantId: "v3",
			label: "L",
			categoryId: "c-phones",
			counted: "3",
		},
	];
	const parse = (value: string) => (value.trim() ? Number(value) : null);

	test("combines the tab, the search and the category", () => {
		expect(
			visibleRowIndexes(rows, {
				filter: "counted",
				query: "",
				categoryIds: null,
				parse,
			}),
		).toEqual([0, 2]);
		expect(
			visibleRowIndexes(rows, {
				filter: "gap",
				query: "",
				categoryIds: null,
				parse,
			}),
		).toEqual([2]);
		expect(
			visibleRowIndexes(rows, {
				filter: "all",
				query: "at-2",
				categoryIds: null,
				parse,
			}),
		).toEqual([1]);
		expect(
			visibleRowIndexes(rows, {
				filter: "all",
				query: "",
				categoryIds: new Set(["c-watch"]),
				parse,
			}),
		).toEqual([1]);
	});

	test("puts the row a scanned barcode names first", () => {
		const scanned = [
			{ ...baseRow, productTitle: "Coque 4006381333931", counted: "" },
			{ ...baseRow, variantId: "v2", barcode: "4006381333931", counted: "" },
			{ ...baseRow, variantId: "v3", barcode: "96385074", counted: "" },
		];
		expect(
			visibleRowIndexes(scanned, {
				filter: "all",
				query: "4006381333931",
				categoryIds: null,
				parse,
			}),
		).toEqual([1, 0]);
	});
});

describe("categoryFamily", () => {
	test("includes every level below the category", () => {
		expect(
			categoryFamily(
				[
					{ id: "a" },
					{ id: "b", parent: "a" },
					{ id: "c", parent: { id: "b" } },
					{ id: "d" },
				],
				"a",
			),
		).toEqual(new Set(["a", "b", "c"]));
	});
});
