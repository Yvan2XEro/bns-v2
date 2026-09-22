// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Products } from "../../src/collections/Products";
import {
	NOT_ARCHIVED,
	ProductVariants,
} from "../../src/collections/ProductVariants";
import {
	MOVEMENT_TYPES,
	StockMovements,
} from "../../src/collections/StockMovements";
import { type Doc, fakePayload, matches } from "./helpers/fakePayload";

const seed = () =>
	fakePayload({
		shops: [
			{ id: "s-1", status: "active", owner: "u-1" },
			{ id: "s-2", status: "active", owner: "u-2" },
		],
		"shop-members": [
			{ id: "m-1", shop: "s-1", user: "u-1", role: "staff", status: "active" },
			{ id: "m-2", shop: "s-2", user: "u-2", role: "owner", status: "active" },
		],
		products: [
			{ id: "p-1", shop: "s-1", title: "Own", status: "active" },
			{ id: "p-2", shop: "s-2", title: "Theirs", status: "active" },
		],
		listings: [
			{ id: "l-1", shop: "s-1", product: null },
			{ id: "l-2", shop: "s-2", product: null },
			{ id: "l-3", shop: "s-1", product: "p-9" },
		],
	});

const req = (user: unknown) => ({
	payload: seed(),
	user,
	context: {} as Record<string, unknown>,
});

const member = { id: "u-1" };
const stranger = { id: "u-9" };
const moderator = { id: "mod-1", role: "moderator" };

type AccessFn = (args: unknown) => unknown;
type FieldAccessFn = (args: unknown) => unknown;
type HookFn = (args: unknown) => Promise<Doc>;

const read = (collection: { access?: { read?: unknown } }) =>
	collection.access?.read as AccessFn;

describe("products access", () => {
	it("shows only active products to a visitor", async () => {
		expect(await read(Products)({ req: req(null) })).toEqual({
			status: { equals: "active" },
		});
	});

	it("adds the caller's own shops to what they can read", async () => {
		expect(await read(Products)({ req: req(member) })).toEqual({
			or: [{ status: { equals: "active" } }, { shop: { in: ["s-1"] } }],
		});
	});

	it("leaves a signed-in stranger with the public scope only", async () => {
		expect(await read(Products)({ req: req(stranger) })).toEqual({
			or: [{ status: { equals: "active" } }, { shop: { in: [] } }],
		});
	});

	it("lets staff read every product", async () => {
		expect(await read(Products)({ req: req(moderator) })).toBe(true);
	});

	it("refuses every direct write: the product service owns them", () => {
		const access = Products.access as Record<string, AccessFn>;
		expect(access.create({ req: req(member) })).toBe(false);
		expect(access.update({ req: req(member) })).toBe(false);
		expect(access.delete({ req: req(moderator) })).toBe(false);
	});
});

describe("product variants access", () => {
	it("hides archived variants from everyone but the shop", async () => {
		expect(await read(ProductVariants)({ req: req(null) })).toEqual(
			NOT_ARCHIVED,
		);
		expect(await read(ProductVariants)({ req: req(member) })).toEqual({
			or: [NOT_ARCHIVED, { shop: { in: ["s-1"] } }],
		});
	});

	it("matches a live variant and not an archived one", () => {
		expect(matches({ id: "v-1" }, NOT_ARCHIVED)).toBe(true);
		expect(matches({ id: "v-2", archivedAt: null }, NOT_ARCHIVED)).toBe(true);
		expect(
			matches(
				{ id: "v-3", archivedAt: "2026-01-01T00:00:00.000Z" },
				NOT_ARCHIVED,
			),
		).toBe(false);
	});

	it("refuses every direct write", () => {
		const access = ProductVariants.access as Record<string, AccessFn>;
		expect(access.create({ req: req(member) })).toBe(false);
		expect(access.update({ req: req(member) })).toBe(false);
		expect(access.delete({ req: req(moderator) })).toBe(false);
	});
});

describe("cost price stays a shop secret", () => {
	const cost = () => {
		const field = ProductVariants.fields.find(
			(f) => "name" in f && f.name === "cost",
		) as { access?: { read?: FieldAccessFn } };
		return field.access?.read as FieldAccessFn;
	};
	const doc = { id: "v-1", shop: "s-1", product: "p-1" };

	it("is hidden from a visitor", async () => {
		expect(await cost()({ req: req(null), doc })).toBe(false);
	});

	it("is hidden from a signed-in stranger", async () => {
		expect(await cost()({ req: req(stranger), doc })).toBe(false);
	});

	it("is hidden from a member of another shop", async () => {
		expect(await cost()({ req: req({ id: "u-2" }), doc })).toBe(false);
	});

	it("is readable by a member of the owning shop", async () => {
		expect(await cost()({ req: req(member), doc })).toBe(true);
	});

	it("is readable by staff", async () => {
		expect(await cost()({ req: req(moderator), doc })).toBe(true);
	});

	it("is hidden when the variant carries no shop", async () => {
		expect(await cost()({ req: req(member), doc: { id: "v-1" } })).toBe(false);
	});
});

describe("stock movements access", () => {
	it("is closed to visitors", async () => {
		expect(await read(StockMovements)({ req: req(null) })).toBe(false);
	});

	it("shows a member their own shops' ledger", async () => {
		expect(await read(StockMovements)({ req: req(member) })).toEqual({
			shop: { in: ["s-1"] },
		});
	});

	it("leaves a stranger with nothing to match", async () => {
		expect(await read(StockMovements)({ req: req(stranger) })).toEqual({
			shop: { in: [] },
		});
	});

	it("lets staff audit the whole ledger", async () => {
		expect(await read(StockMovements)({ req: req(moderator) })).toBe(true);
	});

	it("declares the movement types the ledger accepts", () => {
		expect([...MOVEMENT_TYPES]).toContain("sale");
		expect([...MOVEMENT_TYPES]).toContain("receipt");
	});
});

describe("the stock ledger is append-only", () => {
	const beforeChange = StockMovements.hooks?.beforeChange?.[0] as HookFn;
	const beforeDelete = StockMovements.hooks?.beforeDelete?.[0] as HookFn;

	it("refuses an update through access control, for staff too", () => {
		const access = StockMovements.access as Record<string, AccessFn>;
		expect(access.update({ req: req(moderator) })).toBe(false);
		expect(access.delete({ req: req(moderator) })).toBe(false);
		expect(access.create({ req: req(moderator) })).toBe(false);
	});

	it("refuses an update even from a service that overrides access", async () => {
		await expect(
			beforeChange({
				operation: "update",
				data: { quantity: 5 },
				originalDoc: { id: "sm-1", quantity: 1 },
				req: { ...req(member), context: { stockService: true } },
			}),
		).rejects.toThrow(/append-only/);
	});

	it("refuses a delete even from a service that overrides access", async () => {
		await expect(
			beforeDelete({
				id: "sm-1",
				req: { ...req(moderator), context: { stockService: true } },
			}),
		).rejects.toThrow(/append-only/);
	});

	it("lets a movement be appended", async () => {
		const payload = seed();
		payload.store["product-variants"] = [
			{ id: "v-1", shop: "s-1", product: "p-1" },
		];
		const result = await beforeChange({
			operation: "create",
			data: {
				variant: "v-1",
				product: "p-1",
				shop: "s-1",
				type: "receipt",
				quantity: 3,
				stockAfter: 3,
			},
			req: { payload, user: member, context: {} },
		});
		expect(result.stockAfter).toBe(3);
	});

	it("refuses a movement filed under another shop than the variant's", async () => {
		const payload = seed();
		payload.store["product-variants"] = [
			{ id: "v-1", shop: "s-1", product: "p-1" },
		];
		await expect(
			beforeChange({
				operation: "create",
				data: {
					variant: "v-1",
					product: "p-1",
					shop: "s-2",
					type: "receipt",
					quantity: 3,
					stockAfter: 3,
				},
				req: { payload, user: member, context: {} },
			}),
		).rejects.toThrow(/another shop/);
	});
});

describe("a product and its listing stay in the same shop", () => {
	const beforeChange = Products.hooks?.beforeChange?.[0] as HookFn;

	it("refuses a listing owned by another shop", async () => {
		await expect(
			beforeChange({
				operation: "update",
				originalDoc: { id: "p-1", shop: "s-1" },
				data: { id: "p-1", shop: "s-1", listing: "l-2" },
				req: req(member),
			}),
		).rejects.toThrow(/another shop/);
	});

	it("refuses a listing that already belongs to another product", async () => {
		await expect(
			beforeChange({
				operation: "update",
				originalDoc: { id: "p-1", shop: "s-1" },
				data: { id: "p-1", shop: "s-1", listing: "l-3" },
				req: req(member),
			}),
		).rejects.toThrow(/another product/);
	});

	it("accepts a listing of the product's own shop", async () => {
		const result = await beforeChange({
			operation: "update",
			originalDoc: { id: "p-1", shop: "s-1" },
			data: { id: "p-1", shop: "s-1", listing: "l-1" },
			req: req(member),
		});
		expect(result.listing).toBe("l-1");
	});
});

describe("a variant belongs to its product's shop", () => {
	const beforeChange = ProductVariants.hooks?.beforeChange?.[0] as HookFn;

	it("refuses a variant filed under another shop", async () => {
		await expect(
			beforeChange({
				operation: "create",
				data: { product: "p-2", shop: "s-1", price: 1000 },
				req: req(member),
			}),
		).rejects.toThrow(/another shop/);
	});

	it("accepts a variant of its product's shop", async () => {
		const result = await beforeChange({
			operation: "create",
			data: { product: "p-1", shop: "s-1", price: 1000 },
			req: req(member),
		});
		expect(result.shop).toBe("s-1");
	});
});
