// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: the mock factory below is hoisted above the imports, so the spy
// it returns has to be created there too.
const { validateListingAttributes } = vi.hoisted(() => ({
	validateListingAttributes: vi.fn(
		async () => [] as Array<{ message: string }>,
	),
}));
vi.mock("../../src/hooks/validation", () => ({ validateListingAttributes }));

import { createProduct, updateProduct } from "../../src/services/products";
import { recordMovement, recordStockCount } from "../../src/services/stock";
import { fakePayload } from "./helpers/fakePayload";

const U1 = { id: "u-1" };
const STAFF = { id: "u-2" };

function seed() {
	return fakePayload(
		{
			users: [
				{ id: "u-1", name: "Aïcha" },
				{ id: "u-2", name: "Blaise" },
			],
			categories: [{ id: "cat-1", name: "Téléphones" }],
			shops: [
				{
					id: "s-1",
					status: "active",
					owner: "u-1",
					location: { city: "Douala" },
				},
			],
			"shop-members": [
				{
					id: "m-1",
					shop: "s-1",
					user: "u-1",
					role: "owner",
					status: "active",
				},
				{
					id: "m-2",
					shop: "s-1",
					user: "u-2",
					role: "staff",
					status: "active",
				},
			],
			products: [],
			"product-variants": [],
			"stock-movements": [],
			listings: [],
		},
		{
			// The partial unique index migration 20260922_000000_p1_listing_product
			// builds: one listing per product, and any number without one.
			uniques: { listings: [["product"]] },
		},
	);
}

const input = (overrides: Record<string, unknown> = {}) => ({
	title: "Samsung Galaxy S24 256 Go",
	description: "Neuf, scellé.",
	category: "cat-1",
	condition: "new",
	attributes: { brand: "Samsung" },
	images: ["m-1", "m-2"],
	status: "active",
	options: [
		{ name: "Couleur", values: ["Noir", "Violet"] },
		{ name: "Stockage", values: ["256 Go"] },
	],
	variants: [
		{
			optionValues: { Couleur: "Noir", Stockage: "256 Go" },
			sku: "SGS24-NO256",
			price: 435000,
			cost: 382000,
			lowStockThreshold: 1,
			initialStock: 3,
		},
		{
			optionValues: { Couleur: "Violet", Stockage: "256 Go" },
			sku: "SGS24-VI256",
			price: 450000,
			cost: 382000,
			lowStockThreshold: 1,
			initialStock: 2,
		},
	],
	delivery: { codAllowed: true, pickupAllowed: true, handlingHours: 24 },
	returnPolicy: "Rétractation 15 jours",
	...overrides,
});

/** Feeds the variants a create returned back into an update, unchanged. */
const asInput = (
	variants: Array<Record<string, unknown>>,
	overrides: Record<string, unknown> = {},
) =>
	variants.map((v) => ({
		id: v.id,
		optionValues: v.optionValues,
		sku: v.sku,
		price: v.price,
		...overrides,
	}));

describe("createProduct", () => {
	beforeEach(() => validateListingAttributes.mockClear());

	it("publishes exactly one listing for an active product", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input(),
		);

		expect(variants).toHaveLength(2);
		expect(payload.store.listings).toHaveLength(1);
		const listing = payload.store.listings[0];
		expect(listing).toMatchObject({
			shop: "s-1",
			product: product.id,
			status: "published",
			title: "Samsung Galaxy S24 256 Go",
			price: 435000,
			location: "Douala",
			productSummary: {
				priceMin: 435000,
				priceMax: 450000,
				available: true,
				variantCount: 2,
				trackInventory: true,
			},
		});
		expect(payload.store.products[0].listing).toBe(listing.id);
		expect(
			payload.writes.find(
				(w) => w.op === "create" && w.collection === "listings",
			)?.context,
		).toMatchObject({ productService: true });
	});

	it("records initial stock as receipts", async () => {
		const payload = seed();
		await createProduct(payload, U1, "s-1", input());
		expect(
			payload.store["stock-movements"].map((m) => [
				m.type,
				m.quantity,
				m.unitCost,
			]),
		).toEqual([
			["receipt", 3, 382000],
			["receipt", 2, 382000],
		]);
		expect(payload.store["product-variants"].map((v) => v.stockOnHand)).toEqual(
			[3, 2],
		);
	});

	it("publishes nothing for a draft", async () => {
		const payload = seed();
		await createProduct(payload, U1, "s-1", input({ status: "draft" }));
		expect(payload.store.listings).toHaveLength(0);
	});

	it("accepts a product without options as one default variant", async () => {
		const payload = seed();
		const { variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input({
				options: [],
				variants: [{ optionValues: {}, price: 9000, trackInventory: false }],
			}),
		);
		expect(variants[0]).toMatchObject({
			optionValues: {},
			price: 9000,
			trackInventory: false,
		});
	});

	it("refuses variants that do not match the options", async () => {
		await expect(
			createProduct(
				seed(),
				U1,
				"s-1",
				input({
					variants: [
						{
							optionValues: { Couleur: "Rouge", Stockage: "256 Go" },
							price: 1,
						},
					],
				}),
			),
		).rejects.toMatchObject({ code: "generic.validation", status: 400 });
	});

	it("refuses a duplicate SKU in the shop", async () => {
		const payload = seed();
		await createProduct(payload, U1, "s-1", input());
		await expect(
			createProduct(payload, U1, "s-1", input({ title: "Autre produit" })),
		).rejects.toMatchObject({ code: "generic.validation", status: 409 });
	});

	it("refuses attribute errors from the category", async () => {
		validateListingAttributes.mockResolvedValueOnce([
			{ message: "brand is required" },
		]);
		await expect(
			createProduct(seed(), U1, "s-1", input()),
		).rejects.toMatchObject({ code: "generic.validation" });
	});

	it("refuses a non-member", async () => {
		await expect(
			createProduct(seed(), { id: "u-9" }, "s-1", input()),
		).rejects.toMatchObject({ code: "shop.notMember" });
	});

	it("leaves no product, variant, stock or listing behind when the listing cannot be written", async () => {
		const payload = seed();
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "listings";
		await expect(createProduct(payload, U1, "s-1", input())).rejects.toThrow();
		expect(payload.store.products).toHaveLength(0);
		expect(payload.store["product-variants"]).toHaveLength(0);
		expect(payload.store["stock-movements"]).toHaveLength(0);
		expect(payload.store.listings).toHaveLength(0);
	});
});

describe("updateProduct", () => {
	beforeEach(() => validateListingAttributes.mockClear());

	it("updates the same listing when the product changes", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input(),
		);
		await updateProduct(
			payload,
			U1,
			product.id,
			input({
				title: "Galaxy S24",
				variants: asInput(variants, {
					price: 400000,
					cost: 382000,
					lowStockThreshold: 1,
				}),
			}),
		);

		expect(payload.store.listings).toHaveLength(1);
		expect(payload.store.listings[0]).toMatchObject({
			title: "Galaxy S24",
			price: 400000,
			productSummary: { priceMin: 400000, priceMax: 400000 },
		});
	});

	it("unpublishes the listing when the product is archived", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input(),
		);
		await updateProduct(
			payload,
			U1,
			product.id,
			input({
				status: "archived",
				variants: asInput(variants),
			}),
		);
		expect(payload.store.listings[0].status).toBe("draft");
	});

	it("archives a removed variant and keeps its movements", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input(),
		);
		await updateProduct(
			payload,
			U1,
			product.id,
			input({
				options: [
					{ name: "Couleur", values: ["Noir"] },
					{ name: "Stockage", values: ["256 Go"] },
				],
				variants: [
					{
						id: variants[0].id,
						optionValues: variants[0].optionValues,
						sku: variants[0].sku,
						price: 435000,
					},
				],
			}),
		);
		const removed = payload.store["product-variants"].find(
			(v) => v.id === variants[1].id,
		);
		expect(removed?.archivedAt).toBeTruthy();
		expect(payload.store["stock-movements"]).toHaveLength(2);
		expect(payload.store.listings[0].productSummary.variantCount).toBe(1);
	});

	it("keeps a moderator's rejection", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input(),
		);
		payload.store.listings[0].status = "rejected";
		await updateProduct(
			payload,
			U1,
			product.id,
			input({
				variants: asInput(variants),
			}),
		);
		expect(payload.store.listings[0].status).toBe("rejected");
	});

	it("refreshes availability after a stock movement", async () => {
		const payload = seed();
		const { variants } = await createProduct(payload, U1, "s-1", input());
		await recordMovement(payload, U1, variants[0].id, {
			type: "loss",
			quantity: -3,
		});
		expect(payload.store.listings[0].productSummary.available).toBe(true);
	});

	it("refreshes availability after a physical count", async () => {
		const payload = seed();
		const { variants } = await createProduct(payload, U1, "s-1", input());
		await recordStockCount(payload, U1, "s-1", {
			counts: [
				{ variantId: variants[0].id, counted: 1 },
				{ variantId: variants[1].id, counted: 0 },
			],
		});
		expect(payload.store.listings[0].productSummary.available).toBe(true);
	});

	it("drops an archived variant's units from the published availability", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input(),
		);
		await updateProduct(
			payload,
			U1,
			product.id,
			input({
				options: [
					{ name: "Couleur", values: ["Noir"] },
					{ name: "Stockage", values: ["256 Go"] },
				],
				variants: [
					{
						id: variants[0].id,
						optionValues: variants[0].optionValues,
						sku: variants[0].sku,
						price: 435000,
					},
				],
			}),
		);
		expect(payload.store.listings[0].productSummary).toMatchObject({
			available: true,
			priceMax: 435000,
		});
	});

	it("carries a photo change through to the listing", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input(),
		);
		await updateProduct(
			payload,
			U1,
			product.id,
			input({ images: ["m-3"], variants: asInput(variants) }),
		);
		expect(payload.store.listings[0].images).toEqual([{ image: "m-3" }]);
	});

	it("publishes one listing however often the product is saved active", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input({ status: "draft" }),
		);
		expect(payload.store.listings).toHaveLength(0);

		await updateProduct(
			payload,
			U1,
			product.id,
			input({ variants: asInput(variants) }),
		);
		await updateProduct(
			payload,
			U1,
			product.id,
			input({ variants: asInput(variants) }),
		);

		expect(payload.store.listings).toHaveLength(1);
		expect(payload.store.listings[0].status).toBe("published");
		expect(payload.store.products[0].listing).toBe(
			payload.store.listings[0].id,
		);
	});

	it("re-adopts the listing that already carries the product instead of publishing a second one", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input(),
		);
		// The product lost its pointer; the listing still names the product.
		payload.store.products[0].listing = null;

		await updateProduct(
			payload,
			U1,
			product.id,
			input({ title: "Galaxy S24", variants: asInput(variants) }),
		);

		expect(payload.store.listings).toHaveLength(1);
		expect(payload.store.listings[0]).toMatchObject({
			title: "Galaxy S24",
			product: product.id,
		});
		expect(payload.store.products[0].listing).toBe(
			payload.store.listings[0].id,
		);
	});

	it("publishes one listing when two writers publish the same product at once", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input({ status: "draft" }),
		);

		await Promise.all([
			updateProduct(
				payload,
				U1,
				product.id,
				input({ variants: asInput(variants) }),
			),
			updateProduct(
				payload,
				U1,
				product.id,
				input({ variants: asInput(variants) }),
			),
		]);

		expect(payload.store.listings).toHaveLength(1);
		expect(payload.store.listings[0]).toMatchObject({
			product: product.id,
			status: "published",
		});
		expect(payload.store.products[0].listing).toBe(
			payload.store.listings[0].id,
		);
	});

	it("does not publish a missing listing from a stock movement, and republishes on the next edit", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input(),
		);
		// A moderator deleted the listing before the guard existed, say.
		payload.store.listings.length = 0;
		payload.store.products[0].listing = null;

		await recordMovement(payload, U1, variants[0].id, {
			type: "loss",
			quantity: -1,
		});
		expect(payload.store.listings).toHaveLength(0);

		await recordStockCount(payload, U1, "s-1", {
			counts: [{ variantId: variants[0].id, counted: 5 }],
		});
		expect(payload.store.listings).toHaveLength(0);

		await updateProduct(
			payload,
			U1,
			product.id,
			input({ variants: asInput(variants) }),
		);
		expect(payload.store.listings).toHaveLength(1);
		expect(payload.store.listings[0].status).toBe("published");
	});

	// The editor's half of this — matching the live row to the new combination
	// so the id travels with it — is client-side; what the server must do with
	// that id is here: keep the variant, its stock and its ledger.
	it("keeps the variant and its stock when a simple product gains its first option", async () => {
		const payload = seed();
		const created = await createProduct(
			payload,
			U1,
			"s-1",
			input({
				options: [],
				variants: [
					{
						optionValues: {},
						sku: "AT-PLAIN",
						price: 9000,
						initialStock: 7,
					},
				],
			}),
		);
		const plain = created.variants[0];
		expect(plain.stockOnHand).toBe(7);

		const { variants } = await updateProduct(
			payload,
			U1,
			created.product.id,
			input({
				options: [{ name: "Couleur", values: ["Noir"] }],
				variants: [
					{
						id: plain.id,
						optionValues: { Couleur: "Noir" },
						sku: "AT-PLAIN",
						price: 9000,
					},
				],
			}),
		);

		expect(variants).toHaveLength(1);
		expect(variants[0]).toMatchObject({
			id: plain.id,
			optionValues: { Couleur: "Noir" },
			stockOnHand: 7,
		});
		// Nothing was archived and nothing was created beside it.
		expect(payload.store["product-variants"]).toHaveLength(1);
		expect(
			payload.store["stock-movements"].filter((m) => m.type === "receipt"),
		).toHaveLength(1);
	});

	it("refuses a variant that belongs to another product", async () => {
		const payload = seed();
		const first = await createProduct(payload, U1, "s-1", input());
		const second = await createProduct(
			payload,
			U1,
			"s-1",
			input({
				title: "Autre produit",
				variants: [
					{
						optionValues: { Couleur: "Noir", Stockage: "256 Go" },
						price: 1000,
					},
					{
						optionValues: { Couleur: "Violet", Stockage: "256 Go" },
						price: 1200,
					},
				],
			}),
		);
		await expect(
			updateProduct(
				payload,
				U1,
				second.product.id,
				input({ title: "Autre produit", variants: asInput(first.variants) }),
			),
		).rejects.toMatchObject({ code: "generic.validation" });
	});
});

describe("the purchase cost a save answers with", () => {
	it("is absent from what a staff member's create returns, and unwritten", async () => {
		const payload = seed();
		const { variants } = await createProduct(payload, STAFF, "s-1", input());

		expect(variants).toHaveLength(2);
		for (const variant of variants) {
			expect(Object.hasOwn(variant, "cost")).toBe(false);
		}
		expect(payload.store["product-variants"].map((v) => v.cost)).toEqual([
			null,
			null,
		]);
	});

	it("is absent from what a staff member's update returns", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input(),
		);
		expect(variants.map((v) => v.cost)).toEqual([382000, 382000]);

		const saved = await updateProduct(
			payload,
			STAFF,
			product.id,
			input({
				variants: asInput(variants, { cost: 1, lowStockThreshold: 99 }),
			}),
		);

		for (const variant of saved.variants) {
			expect(Object.hasOwn(variant, "cost")).toBe(false);
		}
		// The owner's costs are untouched: staff can neither read nor rewrite them.
		expect(payload.store["product-variants"].map((v) => v.cost)).toEqual([
			382000, 382000,
		]);
	});

	it("is still there for a manager", async () => {
		const payload = seed();
		const { variants } = await createProduct(payload, U1, "s-1", input());
		expect(variants.map((v) => v.cost)).toEqual([382000, 382000]);
	});
});

// Same rule as `cost` — `redactManagerOnlyFields` redacts both fields the
// same way, so both need the same coverage: a staff reader gets neither
// field, an owner or manager gets both, and a staff write attempt leaves the
// stored value unchanged.
describe("the low-stock threshold a save answers with", () => {
	it("is absent from what a staff member's create returns, and unwritten", async () => {
		const payload = seed();
		const { variants } = await createProduct(payload, STAFF, "s-1", input());

		expect(variants).toHaveLength(2);
		for (const variant of variants) {
			expect(Object.hasOwn(variant, "lowStockThreshold")).toBe(false);
		}
		expect(
			payload.store["product-variants"].map((v) => v.lowStockThreshold),
		).toEqual([null, null]);
	});

	it("is absent from what a staff member's update returns, and the write is ignored", async () => {
		const payload = seed();
		const { product, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			input(),
		);
		expect(variants.map((v) => v.lowStockThreshold)).toEqual([1, 1]);

		const saved = await updateProduct(
			payload,
			STAFF,
			product.id,
			input({
				variants: asInput(variants, { cost: 1, lowStockThreshold: 99 }),
			}),
		);

		for (const variant of saved.variants) {
			expect(Object.hasOwn(variant, "lowStockThreshold")).toBe(false);
		}
		// Staff asked for 99; the owner's original threshold is untouched.
		expect(
			payload.store["product-variants"].map((v) => v.lowStockThreshold),
		).toEqual([1, 1]);
	});

	it("is still there for a manager", async () => {
		const payload = seed();
		const { variants } = await createProduct(payload, U1, "s-1", input());
		expect(variants.map((v) => v.lowStockThreshold)).toEqual([1, 1]);
	});
});
