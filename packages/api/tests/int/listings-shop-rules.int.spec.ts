// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted: `vi.mock` runs before the module body, so the factory cannot close
// over a plain top-level const.
const { validateListingAttributesMock } = vi.hoisted(() => ({
	validateListingAttributesMock: vi.fn(async () => []),
}));
vi.mock("../../src/hooks/validation", () => ({
	validateListingAttributes: validateListingAttributesMock,
}));

import {
	ACCOUNT_DELETION_CONTEXT,
	Listings,
} from "../../src/collections/Listings";
import { fakePayload } from "./helpers/fakePayload";

const beforeChange = Listings.hooks?.beforeChange?.[0] as (
	args: unknown,
) => Promise<Record<string, unknown>>;

const base = {
	id: "l-1",
	title: "iPhone 13 Pro",
	description: "desc",
	price: 285000,
	category: "cat-1",
	condition: "like_new",
	attributes: {},
	status: "published",
	seller: "u-1",
	shop: null,
	product: null,
	productSummary: null,
	images: [{ image: "m-1" }],
	location: "Douala",
};

const productListing = {
	...base,
	shop: "s-1",
	product: "p-1",
	productSummary: {
		priceMin: 285000,
		priceMax: 330000,
		available: true,
		variantCount: 4,
		trackInventory: true,
	},
	moderationHold: true,
	expiresAt: null,
};

function payloadWith(shopStatus = "active") {
	return fakePayload({
		shops: [{ id: "s-1", status: shopStatus, owner: "u-1" }],
		"shop-members": [
			{ id: "m-1", shop: "s-1", user: "u-1", role: "owner", status: "active" },
		],
	});
}

const req = (
	payload: unknown,
	user: unknown,
	context: Record<string, unknown> = {},
) => ({ payload, user, context });

describe("listing shop membership", () => {
	beforeEach(() => validateListingAttributesMock.mockClear());

	it("lets a member publish a listing in their shop", async () => {
		const result = await beforeChange({
			operation: "update",
			originalDoc: base,
			data: { ...base, shop: "s-1" },
			req: req(payloadWith(), { id: "u-1" }),
		});
		expect(result.shop).toBe("s-1");
	});

	it("refuses a non-member", async () => {
		await expect(
			beforeChange({
				operation: "update",
				originalDoc: base,
				data: { ...base, shop: "s-1" },
				req: req(payloadWith(), { id: "u-9" }),
			}),
		).rejects.toMatchObject({ status: 403, data: { code: "shop.notMember" } });
	});

	it("refuses a shop that is not active", async () => {
		await expect(
			beforeChange({
				operation: "update",
				originalDoc: base,
				data: { ...base, shop: "s-1" },
				req: req(payloadWith("suspended"), { id: "u-1" }),
			}),
		).rejects.toMatchObject({ status: 409, data: { code: "shop.inactive" } });
	});

	it("skips the check for moderation writes", async () => {
		const result = await beforeChange({
			operation: "update",
			originalDoc: base,
			data: { ...base, shop: "s-1" },
			req: req(
				payloadWith("suspended"),
				{ id: "mod-1", role: "moderator" },
				{ moderationAction: true },
			),
		});
		expect(result.shop).toBe("s-1");
	});
});

describe("product listing derived fields", () => {
	it("ignores a seller's direct edits", async () => {
		const result = await beforeChange({
			operation: "update",
			originalDoc: productListing,
			data: {
				...productListing,
				title: "Hacked",
				price: 1,
				status: "sold",
				shop: null,
				product: null,
				moderationHold: false,
			},
			req: req(payloadWith(), { id: "u-1" }),
		});
		expect(result.title).toBe("iPhone 13 Pro");
		expect(result.price).toBe(285000);
		expect(result.status).toBe("published");
		expect(result.shop).toBe("s-1");
		expect(result.product).toBe("p-1");
		// A moderator's hold is exactly as pinned as `status`: a seller's own
		// write cannot lift it back off — only a moderation write can.
		expect(result.moderationHold).toBe(true);
	});

	it("accepts the product service's writes", async () => {
		const result = await beforeChange({
			operation: "update",
			originalDoc: productListing,
			data: { ...productListing, title: "iPhone 13 Pro 256 Go" },
			req: req(payloadWith(), { id: "u-1" }, { productService: true }),
		});
		expect(result.title).toBe("iPhone 13 Pro 256 Go");
	});

	it("never lets a client attach a product", async () => {
		const result = await beforeChange({
			operation: "update",
			originalDoc: base,
			data: { ...base, product: "p-9", productSummary: { priceMin: 1 } },
			req: req(payloadWith(), { id: "u-1" }),
		});
		expect(result.product).toBeNull();
		expect(result.productSummary).toBeNull();
	});

	it("allows more than three images on a product listing", async () => {
		const images = Array.from({ length: 6 }, (_, i) => ({ image: `m-${i}` }));
		const result = await beforeChange({
			operation: "update",
			originalDoc: productListing,
			data: { ...productListing, images },
			req: req(payloadWith(), { id: "u-1" }, { productService: true }),
		});
		expect(result.images).toHaveLength(6);
	});

	it("keeps the three-image cap for classified listings", async () => {
		const images = Array.from({ length: 4 }, (_, i) => ({ image: `m-${i}` }));
		await expect(
			beforeChange({
				operation: "update",
				originalDoc: base,
				data: { ...base, images },
				req: req(payloadWith(), { id: "u-1" }),
			}),
		).rejects.toThrow(/at most 3 images/);
	});
});

describe("a listing cannot borrow another shop's product", () => {
	const catalogue = () =>
		fakePayload({
			shops: [
				{ id: "s-1", status: "active", owner: "u-1" },
				{ id: "s-2", status: "active", owner: "u-2" },
			],
			"shop-members": [
				{
					id: "m-1",
					shop: "s-1",
					user: "u-1",
					role: "owner",
					status: "active",
				},
			],
			products: [
				{ id: "p-1", shop: "s-1", title: "Own" },
				{ id: "p-2", shop: "s-2", title: "Someone else's" },
			],
		});

	it("refuses a product owned by another shop", async () => {
		await expect(
			beforeChange({
				operation: "update",
				originalDoc: { ...base, shop: "s-1" },
				data: { ...base, shop: "s-1", product: "p-2" },
				req: req(catalogue(), { id: "u-1" }, { productService: true }),
			}),
		).rejects.toThrow(/another shop/);
	});

	it("refuses a product on a listing that has no shop", async () => {
		await expect(
			beforeChange({
				operation: "update",
				originalDoc: base,
				data: { ...base, product: "p-1" },
				req: req(catalogue(), { id: "u-1" }, { productService: true }),
			}),
		).rejects.toThrow(/must belong to a shop/);
	});

	it("accepts a product of the listing's own shop", async () => {
		const result = await beforeChange({
			operation: "update",
			originalDoc: { ...base, shop: "s-1" },
			data: { ...base, shop: "s-1", product: "p-1" },
			req: req(catalogue(), { id: "u-1" }, { productService: true }),
		});
		expect(result.product).toBe("p-1");
	});
});

describe("deleting a product listing", () => {
	const beforeDelete = Listings.hooks?.beforeDelete?.[0] as (
		args: unknown,
	) => Promise<void>;

	const withListings = (listing: Record<string, unknown>) =>
		fakePayload({ listings: [listing] });

	it("refuses to delete a listing that carries a product", async () => {
		const payload = withListings({ ...productListing, status: "rejected" });
		await expect(
			beforeDelete({ id: "l-1", req: req(payload, { id: "u-1" }) }),
		).rejects.toThrow(/through its product/);
	});

	it("refuses a moderator too, so a rejection cannot be escaped", async () => {
		const payload = withListings({ ...productListing, status: "rejected" });
		await expect(
			beforeDelete({
				id: "l-1",
				req: req(
					payload,
					{ id: "u-9", role: "moderator" },
					{
						moderationAction: true,
					},
				),
			}),
		).rejects.toThrow(/through its product/);
	});

	it("lets the account-deletion cascade take it", async () => {
		const payload = withListings({ ...productListing, status: "published" });
		await expect(
			beforeDelete({
				id: "l-1",
				req: req(payload, { id: "u-1" }, ACCOUNT_DELETION_CONTEXT),
			}),
		).resolves.toBeUndefined();
	});

	it("still lets a plain listing be deleted", async () => {
		const payload = withListings({ ...base, product: null });
		await expect(
			beforeDelete({ id: "l-1", req: req(payload, { id: "u-1" }) }),
		).resolves.toBeUndefined();
	});
});

// moderationHold records a moderator's decision about the listing's owner —
// the owner must not even read it back, the same discipline
// Shops.suspendedNote already follows for the shop's owner.
describe("moderationHold is staff-only to read", () => {
	const fieldAccess = () => {
		const group = Listings.fields.find(
			(f) => "name" in f && f.name === "moderationHold",
		) as { access?: { read?: (args: unknown) => unknown } };
		return group.access?.read as (args: unknown) => unknown;
	};

	it("is hidden from a visitor", () => {
		expect(fieldAccess()({ req: req(null, null) })).toBe(false);
	});

	it("is hidden from the listing's own seller", () => {
		expect(fieldAccess()({ req: req(null, { id: "u-1" }) })).toBe(false);
	});

	it("is readable by a moderator", () => {
		expect(
			fieldAccess()({ req: req(null, { id: "mod-1", role: "moderator" }) }),
		).toBe(true);
	});

	it("is readable by an admin", () => {
		expect(
			fieldAccess()({ req: req(null, { id: "admin-1", role: "admin" }) }),
		).toBe(true);
	});
});
