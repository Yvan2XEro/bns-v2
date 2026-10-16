import { describe, expect, test } from "bun:test";
import type { ListingAttribute } from "./listingForm";
import {
	canLeaveStep,
	emptyProductForm,
	emptyVariantRow,
	firstProductIssueStep,
	fromProductDetail,
	parseAmount,
	productFormIssues,
	productStepIssues,
	syncVariantRows,
	toProductInput,
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

	test("turning a simple product into a variant product keeps the existing row", () => {
		const form = filled();
		form.variants[0] = {
			...form.variants[0],
			id: "v1",
			sku: "SIMPLE",
			price: "435000",
			stockOnHand: 5,
		};

		// Toggling the switch on with no value typed yet: the sole combo is
		// still `{}`, so the row must not move.
		form.hasVariants = true;
		form.options = [{ name: "Couleur", values: [] }];
		form.variants = syncVariantRows(form);
		expect(form.variants).toHaveLength(1);
		expect(form.variants[0].id).toBe("v1");

		// The first value is committed: the sole combo's identity changes from
		// "" to "Noir", but it is still the same one row.
		form.options = [{ name: "Couleur", values: ["Noir"] }];
		const rows = syncVariantRows(form);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: "v1",
			sku: "SIMPLE",
			price: "435000",
			stockOnHand: 5,
		});
		expect(rows[0].optionValues).toEqual({ Couleur: "Noir" });
	});

	test("collapsing a variant product back to simple keeps the surviving row", () => {
		const form = filled();
		form.hasVariants = true;
		form.options = [{ name: "Couleur", values: ["Noir"] }];
		form.variants = syncVariantRows(form);
		form.variants[0] = {
			...form.variants[0],
			id: "v1",
			sku: "NO",
			price: "435000",
			stockOnHand: 3,
		};

		// The option is removed entirely: the form is a simple product again.
		form.hasVariants = false;
		const rows = syncVariantRows(form);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: "v1",
			sku: "NO",
			price: "435000",
			stockOnHand: 3,
		});
		expect(rows[0].optionValues).toEqual({});
	});

	test("inserting an option in the middle keeps a single-combination row", () => {
		const form = filled();
		form.hasVariants = true;
		form.options = [{ name: "Couleur", values: ["Noir"] }];
		form.variants = syncVariantRows(form);
		form.variants[0] = {
			...form.variants[0],
			id: "v1",
			sku: "NO",
			price: "435000",
		};

		// A "Stockage" option is inserted between what will become two options;
		// with a single value it still leaves exactly one combination.
		form.options = [
			{ name: "Couleur", values: ["Noir"] },
			{ name: "Stockage", values: ["256 Go"] },
		];
		const rows = syncVariantRows(form);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ id: "v1", sku: "NO", price: "435000" });
		expect(rows[0].optionValues).toEqual({
			Couleur: "Noir",
			Stockage: "256 Go",
		});
	});

	test("removing an option in the middle keeps a single-combination row", () => {
		const form = filled();
		form.hasVariants = true;
		form.options = [
			{ name: "Couleur", values: ["Noir"] },
			{ name: "Stockage", values: ["256 Go"] },
			{ name: "Etat", values: ["Neuf"] },
		];
		form.variants = syncVariantRows(form);
		form.variants[0] = {
			...form.variants[0],
			id: "v1",
			sku: "NO",
			price: "435000",
		};

		// The middle option is deleted; one combination remains, as before.
		form.options = [
			{ name: "Couleur", values: ["Noir"] },
			{ name: "Etat", values: ["Neuf"] },
		];
		const rows = syncVariantRows(form);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ id: "v1", sku: "NO", price: "435000" });
		expect(rows[0].optionValues).toEqual({ Couleur: "Noir", Etat: "Neuf" });
	});

	test("prefers an exact match over a longer subsequence match", () => {
		const form = filled();
		form.hasVariants = true;
		form.options = [{ name: "Couleur", values: ["Noir"] }];
		// The longer row is listed first, so a subsequence-only search (without
		// the exact-match pass running first) would claim it for the shorter
		// combo below purely because it happens to be scanned first.
		form.variants = [
			{
				...emptyVariantRow({ Couleur: "Noir", Stockage: "256 Go" }),
				id: "vLong",
				sku: "LONG",
			},
			{ ...emptyVariantRow({ Couleur: "Noir" }), id: "vExact", sku: "EXACT" },
		];

		const rows = syncVariantRows(form);

		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe("vExact");
	});
});

describe("issues", () => {
	const paths = (form: ReturnType<typeof filled>, attrs = ATTRS) =>
		productFormIssues(form, attrs).map((issue) => issue.path);

	test("reports a short title and a missing category on the info step", () => {
		const form = emptyProductForm();
		form.title = "ab";
		const info = productStepIssues(productFormIssues(form, ATTRS), "info");
		expect(info.map((issue) => issue.path).sort()).toEqual([
			"category",
			"title",
		]);
	});

	test("a blank price is missing, never sent as 0", () => {
		const form = filled();
		expect(productFormIssues(form, ATTRS)).toContainEqual({
			path: "variants.0.price",
			rule: "required",
		});
	});

	test("a complete form has nothing the server would refuse", () => {
		const form = filled();
		form.variants[0].price = "1000";
		expect(productFormIssues(form, ATTRS)).toEqual([]);
	});

	test("a required category attribute blocks the info step", () => {
		const form = filled();
		form.variants[0].price = "1000";
		form.attributes = {};
		const attrs = [{ ...ATTRS[0], required: true }];
		expect(paths(form, attrs)).toEqual(["attributes.brand"]);
		expect(firstProductIssueStep(productFormIssues(form, attrs))).toBe(1);
	});

	test("a select value outside the category's options is refused like the server does", () => {
		const form = filled();
		form.variants[0].price = "1000";
		const attrs = [
			{
				name: "Couleur",
				slug: "color",
				type: "select" as const,
				required: false,
				options: [{ value: "red", label: "Rouge" }],
			},
		];
		form.attributes = { color: "blue" };
		expect(paths(form, attrs)).toEqual(["attributes.color"]);
	});

	test("two variants with the same SKU are caught on the variants step", () => {
		const form = filled();
		form.hasVariants = true;
		form.options = [{ name: "Couleur", values: ["Noir", "Blanc"] }];
		form.variants = syncVariantRows(form);
		for (const row of form.variants) {
			row.price = "1000";
			row.sku = "S24";
		}
		const issues = productFormIssues(form, ATTRS);
		expect(issues).toEqual([{ path: "variants.1.sku", rule: "duplicate" }]);
		expect(firstProductIssueStep(issues)).toBe(2);
	});

	test("variants switched on without any option value are refused", () => {
		const form = filled();
		form.variants[0].price = "1000";
		form.hasVariants = true;
		form.options = [{ name: "Couleur", values: [] }];
		expect(paths(form)).toEqual(["options"]);
	});

	test("an option value longer than the server allows is caught", () => {
		const form = filled();
		form.hasVariants = true;
		form.options = [{ name: "Couleur", values: ["x".repeat(31)] }];
		form.variants = syncVariantRows(form);
		form.variants[0].price = "1000";
		expect(paths(form)).toContain("options.0.values");
	});

	test("a preparation time over 720 hours blocks the publish step", () => {
		const form = filled();
		form.variants[0].price = "1000";
		form.handlingHours = "721";
		const issues = productFormIssues(form, ATTRS);
		expect(issues).toEqual([
			{ path: "delivery.handlingHours", rule: "max", params: { max: 720 } },
		]);
		expect(firstProductIssueStep(issues)).toBe(3);
	});

	test("a return policy over 2000 characters is caught", () => {
		const form = filled();
		form.variants[0].price = "1000";
		form.returnPolicy = "x".repeat(2001);
		expect(paths(form)).toEqual(["returnPolicy"]);
	});
});

describe("wizard step gating", () => {
	test("a step holding a value the server refuses cannot be left", () => {
		const form = filled();
		form.variants[0].price = "1000";
		const attrs = [{ ...ATTRS[1], max: 24 }];
		form.attributes = { warranty: "36" };
		const issues = productFormIssues(form, attrs);
		expect(canLeaveStep(issues, 1)).toBe(false);
		expect(canLeaveStep(issues, 2)).toBe(true);
	});

	test("the variants step cannot be left with a variant priced blank", () => {
		const issues = productFormIssues(filled(), ATTRS);
		expect(canLeaveStep(issues, 1)).toBe(true);
		expect(canLeaveStep(issues, 2)).toBe(false);
	});

	test("the server's refusal of a taken SKU sends the seller back to the variants step", () => {
		expect(
			firstProductIssueStep([{ path: "variants.0.sku", rule: "taken" }]),
		).toBe(2);
		expect(
			firstProductIssueStep([{ path: "attributes.brand", rule: "invalid" }]),
		).toBe(1);
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
				attributes: { brand: "Apple" },
				images: [{ image: { id: "m1", url: "https://x/y.jpg" } as never }],
				status: "active",
				options: [{ name: "Couleur", values: ["Or"] }],
				delivery: { codAllowed: true, pickupAllowed: true, handlingHours: 24 },
				returnPolicy: "15 jours",
				warrantyMonths: 3,
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

		expect(form.warrantyMonths).toBe("3");
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

describe("warrantyMonths", () => {
	test("blank and zero send no warranty, a number sends whole months", () => {
		const form = filled();
		expect(toProductInput(form, ATTRS).warrantyMonths).toBeNull();
		form.warrantyMonths = "0";
		expect(toProductInput(form, ATTRS).warrantyMonths).toBeNull();
		form.warrantyMonths = "12";
		expect(toProductInput(form, ATTRS).warrantyMonths).toBe(12);
	});

	test("over the shared limit is an issue on the publish step", () => {
		const form = filled();
		form.variants[0].price = "1000";
		form.warrantyMonths = "61";
		const issues = productFormIssues(form, ATTRS);
		expect(issues).toContainEqual(
			expect.objectContaining({ path: "warrantyMonths", rule: "max" }),
		);
		expect(productStepIssues(issues, "publish").map((i) => i.path)).toContain(
			"warrantyMonths",
		);
		expect(canLeaveStep(issues, 3)).toBe(false);
		form.warrantyMonths = "60";
		expect(
			productFormIssues(form, ATTRS).some((i) => i.path === "warrantyMonths"),
		).toBe(false);
	});
});
