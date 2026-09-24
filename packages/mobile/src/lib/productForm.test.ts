import { describe, expect, test } from "bun:test";
import type { ListingAttribute } from "./listingForm";
import {
	emptyProductForm,
	fromProductDetail,
	infoIssues,
	parseAmount,
	syncVariantRows,
	toProductInput,
	variantIssues,
} from "./productForm";

const ATTRS: ListingAttribute[] = [
	{ name: "Marque", slug: "brand", type: "text", required: false, options: [] },
	{
		name: "Garantie (mois)",
		slug: "warranty",
		type: "number",
		required: false,
		options: [],
	},
];

function filled() {
	const form = emptyProductForm();
	form.title = "  Samsung Galaxy S24 256 Go ";
	form.category = { id: "cat-phones", name: "Téléphones" } as never;
	form.condition = "new";
	form.attributes = { brand: "Samsung", warranty: "12" };
	form.images = [
		{ id: "m1", uri: "a" },
		{ id: "m2", uri: "b" },
	];
	return form;
}

describe("parseAmount", () => {
	test("keeps digits only", () => {
		expect(parseAmount("435 000")).toBe(435000);
		expect(parseAmount("")).toBeNull();
	});

	test("rejects hex and exponent forms instead of reinterpreting them", () => {
		expect(parseAmount("0x1F")).toBeNull();
		expect(parseAmount("1e5")).toBeNull();
		expect(parseAmount("12.5")).toBeNull();
		expect(parseAmount("-5")).toBeNull();
	});
});

describe("toProductInput", () => {
	test("sends a single default variant when the product has no options", () => {
		const form = filled();
		form.variants[0].price = "435 000";
		form.variants[0].cost = "382000";
		form.variants[0].initialStock = "5";
		form.variants[0].lowStockThreshold = "1";

		const input = toProductInput(form, ATTRS);

		expect(input.title).toBe("Samsung Galaxy S24 256 Go");
		expect(input.category).toBe("cat-phones");
		expect(input.images).toEqual(["m1", "m2"]);
		expect(input.attributes).toEqual({ brand: "Samsung", warranty: 12 });
		expect(input.options).toEqual([]);
		expect(input.variants).toEqual([
			{
				optionValues: {},
				sku: null,
				price: 435000,
				cost: 382000,
				trackInventory: true,
				lowStockThreshold: 1,
				initialStock: 5,
			},
		]);
	});

	test("never sends initial stock for an existing variant", () => {
		const form = filled();
		form.variants[0] = {
			...form.variants[0],
			id: "v1",
			price: "1000",
			initialStock: "9",
		};
		expect(toProductInput(form, ATTRS).variants[0]).not.toHaveProperty(
			"initialStock",
		);
		expect(toProductInput(form, ATTRS).variants[0].id).toBe("v1");
	});

	test("sends one variant per option combination", () => {
		const form = filled();
		form.hasVariants = true;
		form.options = [
			{ name: "Couleur", values: ["Noir", "Violet"] },
			{ name: "Stockage", values: ["256 Go"] },
		];
		form.variants = syncVariantRows(form);
		for (const row of form.variants) row.price = "435000";

		const input = toProductInput(form, ATTRS);
		expect(input.options).toEqual(form.options);
		expect(input.variants.map((v) => v.optionValues)).toEqual([
			{ Couleur: "Noir", Stockage: "256 Go" },
			{ Couleur: "Violet", Stockage: "256 Go" },
		]);
	});
});

describe("syncVariantRows", () => {
	test("keeps rows whose combination survives and copies the first price into new ones", () => {
		const form = filled();
		form.hasVariants = true;
		form.options = [{ name: "Couleur", values: ["Noir"] }];
		form.variants = syncVariantRows(form);
		form.variants[0].price = "435000";
		form.variants[0].sku = "NO";

		form.options = [{ name: "Couleur", values: ["Noir", "Violet"] }];
		const rows = syncVariantRows(form);

		expect(rows).toHaveLength(2);
		expect(rows[0].sku).toBe("NO");
		expect(rows[1].price).toBe("435000");
		expect(rows[1].sku).toBe("");
	});

	test("renaming an option does not lose an existing row's identity or fields", () => {
		const form = filled();
		form.hasVariants = true;
		form.options = [{ name: "Couleur", values: ["Noir", "Violet"] }];
		form.variants = syncVariantRows(form);
		form.variants[0].id = "v1";
		form.variants[0].sku = "NO";
		form.variants[0].price = "435000";
		form.variants[0].cost = "300000";
		form.variants[0].lowStockThreshold = "2";
		form.variants[0].stockOnHand = 5;
		const keyBefore = form.variants[0].key;

		// Renamed keystroke by keystroke, as the UI would do while typing.
		form.options = [{ name: "C", values: ["Noir", "Violet"] }];
		form.variants = syncVariantRows(form);
		form.options = [{ name: "Coloris", values: ["Noir", "Violet"] }];
		const rows = syncVariantRows(form);

		expect(rows).toHaveLength(2);
		const kept = rows.find((r) => r.optionValues.Coloris === "Noir");
		expect(kept).toMatchObject({
			id: "v1",
			sku: "NO",
			price: "435000",
			cost: "300000",
			lowStockThreshold: "2",
			stockOnHand: 5,
		});
		expect(kept?.key).toBe(keyBefore);
		expect(kept?.optionValues).toEqual({ Coloris: "Noir" });
	});
});

describe("issues", () => {
	test("reports a short title and a missing category", () => {
		const form = emptyProductForm();
		form.title = "ab";
		expect(infoIssues(form).sort()).toEqual(["category", "title"]);
	});

	test("reports a variant without a price", () => {
		const form = filled();
		expect(variantIssues(form)).toEqual(["price"]);
	});
});

describe("fromProductDetail", () => {
	test("maps variants, options and images back into the form", () => {
		const form = fromProductDetail({
			role: "owner",
			listing: null,
			movements: [],
			product: {
				id: "p1",
				shop: "s1",
				title: "iPhone 13 Pro",
				description: "Neuf",
				category: { id: "c1", name: "Téléphones" } as never,
				condition: "like_new",
				attributes: { brand: "Apple" },
				images: [{ image: { id: "m1", url: "https://x/y.jpg" } as never }],
				status: "active",
				options: [{ name: "Couleur", values: ["Or"] }],
				delivery: { codAllowed: true, pickupAllowed: true, handlingHours: 24 },
				returnPolicy: "15 jours",
				updatedAt: "",
				createdAt: "",
			},
			variants: [
				{
					id: "v1",
					product: "p1",
					shop: "s1",
					optionValues: { Couleur: "Or" },
					sku: "AT-OR",
					price: 285000,
					cost: 240000,
					trackInventory: true,
					stockOnHand: 5,
					stockReserved: 0,
					lowStockThreshold: 2,
					archivedAt: null,
				},
			],
		});

		expect(form.hasVariants).toBe(true);
		expect(form.images).toEqual([{ id: "m1", uri: "https://x/y.jpg" }]);
		expect(form.variants[0]).toMatchObject({
			id: "v1",
			price: "285000",
			cost: "240000",
			stockOnHand: 5,
			lowStockThreshold: "2",
		});
		expect(form.handlingHours).toBe("24");
	});
});
