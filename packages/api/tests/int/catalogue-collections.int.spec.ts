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
	trustLoadedVariant,
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
			{
				id: "m-3",
				shop: "s-1",
				user: "u-3",
				role: "manager",
				status: "active",
			},
			{ id: "m-4", shop: "s-1", user: "u-4", role: "owner", status: "active" },
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
const manager = { id: "u-3" };
const owner = { id: "u-4" };

type AccessFn = (args: unknown) => unknown;
type FieldAccessFn = (args: unknown) => unknown;
type HookFn = (args: unknown) => Promise<Doc>;

const read = (collection: { access?: { read?: unknown } }) =>
	collection.access?.read as AccessFn;

/** Which of `rows` an access rule actually lets through. */
const visible = (rule: unknown, rows: Doc[]): unknown[] => {
	if (rule === true) return rows.map((row) => row.id);
	if (rule === false || typeof rule !== "object" || rule === null) return [];
	return rows.filter((row) => matches(row, rule as Doc)).map((row) => row.id);
};

const PRODUCT_ROWS: Doc[] = [
	{ id: "p-1", shop: "s-1", status: "active" },
	{ id: "p-draft", shop: "s-1", status: "draft" },
	{ id: "p-2", shop: "s-2", status: "active" },
	{ id: "p-other-draft", shop: "s-2", status: "archived" },
];

describe("products access", () => {
	it("shows a visitor the active products and nothing else", async () => {
		expect(
			visible(await read(Products)({ req: req(null) }), PRODUCT_ROWS),
		).toEqual(["p-1", "p-2"]);
	});

	it("adds the caller's own drafts to what they can read", async () => {
		expect(
			visible(await read(Products)({ req: req(member) }), PRODUCT_ROWS),
		).toEqual(["p-1", "p-draft", "p-2"]);
	});

	it("leaves a signed-in stranger with the public rows only", async () => {
		expect(
			visible(await read(Products)({ req: req(stranger) }), PRODUCT_ROWS),
		).toEqual(["p-1", "p-2"]);
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
	// The Mongo adapter resolves `product.status` into a sub-query on `products`
	// and rewrites it to `product: { $in }`; the in-memory fake walks a populated
	// relation instead, so these rows carry their product inline.
	const VARIANT_ROWS: Doc[] = [
		{ id: "v-1", shop: "s-1", product: { id: "p-1", status: "active" } },
		{ id: "v-draft", shop: "s-1", product: { id: "p-draft", status: "draft" } },
		{ id: "v-2", shop: "s-2", product: { id: "p-2", status: "active" } },
		{
			id: "v-other-draft",
			shop: "s-2",
			product: { id: "p-other-draft", status: "draft" },
		},
		{
			id: "v-archived",
			shop: "s-1",
			archivedAt: "2026-01-01T00:00:00.000Z",
			product: { id: "p-1", status: "active" },
		},
	];

	it("shows a visitor only live variants of published products", async () => {
		expect(
			visible(await read(ProductVariants)({ req: req(null) }), VARIANT_ROWS),
		).toEqual(["v-1", "v-2"]);
	});

	it("hides another shop's draft catalogue from a signed-in stranger", async () => {
		expect(
			visible(
				await read(ProductVariants)({ req: req(stranger) }),
				VARIANT_ROWS,
			),
		).toEqual(["v-1", "v-2"]);
	});

	it("shows a member their own shop's drafts and archived variants", async () => {
		expect(
			visible(await read(ProductVariants)({ req: req(member) }), VARIANT_ROWS),
		).toEqual(["v-1", "v-draft", "v-2", "v-archived"]);
	});

	it("lets staff read everything", async () => {
		expect(await read(ProductVariants)({ req: req(moderator) })).toBe(true);
	});

	it("keeps NOT_ARCHIVED matching both shapes of a live variant", () => {
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
	// This is the exact function Payload's REST handler calls per document to
	// decide whether `cost` is serialized — so exercising it directly covers
	// `GET /api/product-variants?where[shop][equals]=…`, the path the web
	// client actually uses, the same way `read(ProductVariants)` above covers
	// the collection-level REST read.
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

	// Staff is an active member of the owning shop, and plain membership is
	// enough to read the variant document itself — but not its cost.
	it("is hidden from a staff member of the owning shop", async () => {
		expect(await cost()({ req: req(member), doc })).toBe(false);
	});

	it("is readable by a manager of the owning shop", async () => {
		expect(await cost()({ req: req(manager), doc })).toBe(true);
	});

	it("is readable by an owner of the owning shop", async () => {
		expect(await cost()({ req: req(owner), doc })).toBe(true);
	});

	it("is readable by platform staff", async () => {
		expect(await cost()({ req: req(moderator), doc })).toBe(true);
	});

	it("is hidden when the variant carries no shop", async () => {
		expect(await cost()({ req: req(member), doc: { id: "v-1" } })).toBe(false);
	});

	// The collection closes every direct write (see "refuses every direct
	// write" above), so a staff member cannot set `cost` through the REST API
	// either — no separate field-level write rule is needed to say it twice.
	it("cannot be set directly: the collection refuses every write", () => {
		const access = ProductVariants.access as Record<string, AccessFn>;
		expect(access.update({ req: req(member) })).toBe(false);
	});
});

describe("stock movements access", () => {
	it("is closed to visitors", async () => {
		expect(await read(StockMovements)({ req: req(null) })).toBe(false);
	});

	const MOVEMENT_ROWS: Doc[] = [
		{ id: "sm-1", shop: "s-1", type: "receipt" },
		{ id: "sm-2", shop: "s-2", type: "sale" },
	];

	it("shows a member their own shops' ledger", async () => {
		expect(
			visible(await read(StockMovements)({ req: req(member) }), MOVEMENT_ROWS),
		).toEqual(["sm-1"]);
	});

	it("leaves a stranger with nothing to match", async () => {
		expect(
			visible(
				await read(StockMovements)({ req: req(stranger) }),
				MOVEMENT_ROWS,
			),
		).toEqual([]);
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

describe("the ledger can trust a variant the stock service already loaded", () => {
	const beforeChange = StockMovements.hooks?.beforeChange?.[0] as HookFn;

	// An empty store: anything the hook lets through here was checked without a
	// second read of the variant.
	const emptyStore = () => fakePayload({});

	const movement = (shop: string) => ({
		variant: "v-1",
		product: "p-1",
		shop,
		type: "receipt",
		quantity: 3,
		stockAfter: 3,
	});

	it("appends without reading the variant back", async () => {
		const context: Record<string, unknown> = {};
		trustLoadedVariant(context, { id: "v-1", shop: "s-1" });
		const payload = emptyStore();
		const result = await beforeChange({
			operation: "create",
			data: movement("s-1"),
			req: { payload, user: member, context },
		});
		expect(result.stockAfter).toBe(3);
		expect(payload.writes).toHaveLength(0);
	});

	it("still refuses a shop the loaded variant does not belong to", async () => {
		const context: Record<string, unknown> = {};
		trustLoadedVariant(context, { id: "v-1", shop: "s-1" });
		await expect(
			beforeChange({
				operation: "create",
				data: movement("s-2"),
				req: { payload: emptyStore(), user: member, context },
			}),
		).rejects.toThrow(/another shop/);
	});

	it("ignores a loaded variant that is not the one being appended", async () => {
		const context: Record<string, unknown> = {};
		trustLoadedVariant(context, { id: "v-9", shop: "s-1" });
		await expect(
			beforeChange({
				operation: "create",
				data: movement("s-1"),
				req: { payload: emptyStore(), user: member, context },
			}),
		).rejects.toThrow(/does not exist/);
	});

	it("ignores a forged context flag: only a symbol key is trusted", async () => {
		await expect(
			beforeChange({
				operation: "create",
				data: movement("s-1"),
				req: {
					payload: emptyStore(),
					user: member,
					context: {
						loadedVariant: { id: "v-1", shop: "s-1" },
						"stock-movements.loadedVariant": { id: "v-1", shop: "s-1" },
						stockService: true,
					},
				},
			}),
		).rejects.toThrow(/does not exist/);
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

	// A create has no id yet — Mongo assigns it after the hook — so the claim
	// can never be "mine" and a new product must not be able to take it.
	it("refuses a claimed listing on a product that is being created", async () => {
		await expect(
			beforeChange({
				operation: "create",
				data: { shop: "s-1", listing: "l-3" },
				req: req(member),
			}),
		).rejects.toThrow(/another product/);
	});

	it("still lets a product being created claim a free listing", async () => {
		const result = await beforeChange({
			operation: "create",
			data: { shop: "s-1", listing: "l-1" },
			req: req(member),
		});
		expect(result.listing).toBe("l-1");
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
