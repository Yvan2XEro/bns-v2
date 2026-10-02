// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	addCartItem,
	clearCart,
	getCartView,
	loadActiveCart,
	removeCartItem,
	revalidateCartLines,
	setCartItemQuantity,
} from "../../src/services/cart";
import { fakePayload } from "./helpers/fakePayload";

const BUYER = { id: "u-buyer" };

type StoredCartItem = {
	id: string;
	variant: string;
	quantity: number;
	priceAtAdd: number;
};
type StoredCart = { id: string; status: string; items: StoredCartItem[] };
type StoredVariant = {
	id: string;
	price: number;
	archivedAt: string | null;
	stockOnHand: number;
	stockReserved: number;
};

/**
 * `fakePayload`'s `store` is deliberately untyped (`Record<string, Doc[]>`,
 * `Doc = Record<string, unknown>`), so indexing two levels deep off it
 * (`.items[0].quantity`) hits `unknown`. These two accessors cast once, at
 * the one place that needs to, to the shape this fixture actually writes.
 */
function cartsOf(payload: ReturnType<typeof world>): StoredCart[] {
	return payload.store.carts as unknown as StoredCart[];
}
function variantsOf(payload: ReturnType<typeof world>): StoredVariant[] {
	return payload.store["product-variants"] as unknown as StoredVariant[];
}
function mustFind<T extends { id: string }>(rows: T[], id: string): T {
	const row = rows.find((r) => r.id === id);
	if (!row) throw new Error(`fixture missing row ${id}`);
	return row;
}

type Overrides = {
	shop?: Record<string, unknown>;
	product?: Record<string, unknown>;
	listing?: Record<string, unknown>;
	variant?: Record<string, unknown>;
	extraUsers?: Record<string, unknown>[];
	extraShopMembers?: Record<string, unknown>[];
	carts?: Record<string, unknown>[];
	ordersEnabled?: boolean;
};

/**
 * One shop (`s-1`), one product (`p-1`) with one listing (`l-1`) and one
 * variant (`v-1`), every dimension orderable. Each `*Unavailable` test below
 * overrides exactly one field off this baseline, so the seven checks stay
 * independent of each other and of execution order.
 */
function world(overrides: Overrides = {}) {
	return fakePayload(
		{
			users: [
				{ id: "u-buyer", name: "Buyer" },
				{ id: "u-owner", name: "Owner" },
				...(overrides.extraUsers ?? []),
			],
			shops: [
				{
					id: "s-1",
					name: "Chez Awa",
					status: "active",
					owner: "u-owner",
					level: 2,
					ordersRestrictedAt: null,
					orderSettings: { codEnabled: true },
					location: { city: "douala" },
					...overrides.shop,
				},
			],
			"shop-members": [
				{
					id: "m-owner",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
				},
				...(overrides.extraShopMembers ?? []),
			],
			products: [
				{
					id: "p-1",
					shop: "s-1",
					title: "AirPods",
					status: "active",
					delivery: { codAllowed: true },
					...overrides.product,
				},
			],
			listings: [
				{
					id: "l-1",
					title: "AirPods Pro",
					status: "published",
					shop: "s-1",
					product: "p-1",
					...overrides.listing,
				},
			],
			"product-variants": [
				{
					id: "v-1",
					product: "p-1",
					shop: "s-1",
					price: 10_000,
					trackInventory: true,
					stockOnHand: 5,
					stockReserved: 0,
					archivedAt: null,
					...overrides.variant,
				},
			],
			carts: overrides.carts ?? [],
		},
		{
			uniques: { carts: [["user", "status"]] },
			globals: {
				"app-settings": {
					orders: {
						enabled: overrides.ordersEnabled ?? true,
						// Only Douala is a launch city here, so the "city not served"
						// case needs no second override: Yaoundé already fails it.
						launchCities: [{ key: "douala", deliveryFee: 2000 }],
					},
				},
			},
		},
	);
}

const addInput = (patch: Record<string, unknown> = {}) => ({
	listingId: "l-1",
	variantId: "v-1",
	quantity: 1,
	...patch,
});

function secondShop(payload: ReturnType<typeof world>) {
	payload.store.shops.push({
		id: "s-2",
		name: "Autre Boutique",
		status: "active",
		owner: "u-owner-2",
		ordersRestrictedAt: null,
		orderSettings: { codEnabled: true },
		location: { city: "douala" },
	});
	payload.store.users.push({ id: "u-owner-2", name: "Owner 2" });
	payload.store.products.push({
		id: "p-2",
		shop: "s-2",
		title: "Sac",
		status: "active",
		delivery: { codAllowed: true },
	});
	payload.store.listings.push({
		id: "l-2",
		title: "Sac à main",
		status: "published",
		shop: "s-2",
		product: "p-2",
	});
	payload.store["product-variants"].push({
		id: "v-2",
		product: "p-2",
		shop: "s-2",
		price: 5_000,
		trackInventory: true,
		stockOnHand: 5,
		stockReserved: 0,
		archivedAt: null,
	});
}

describe("addCartItem: the active cart", () => {
	it("creates the active cart on the first add", async () => {
		const payload = world();
		const view = await addCartItem(payload, BUYER, addInput());
		expect(view.id).not.toBeNull();
		expect(payload.store.carts).toHaveLength(1);
		expect(payload.store.carts[0].status).toBe("active");
		expect(payload.store.carts[0].items).toHaveLength(1);
	});

	it("reuses it on the second add", async () => {
		const payload = world();
		payload.store["product-variants"].push({
			id: "v-2",
			product: "p-1",
			shop: "s-1",
			price: 3_000,
			trackInventory: true,
			stockOnHand: 5,
			stockReserved: 0,
			archivedAt: null,
		});
		const first = await addCartItem(payload, BUYER, addInput());
		const second = await addCartItem(
			payload,
			BUYER,
			addInput({ variantId: "v-2" }),
		);
		expect(payload.store.carts).toHaveLength(1);
		expect(first.id).toBe(second.id);
		expect(second.lines).toHaveLength(2);
	});

	it("merges the same variant into one line instead of adding a second", async () => {
		const payload = world();
		await addCartItem(payload, BUYER, addInput({ quantity: 1 }));
		const view = await addCartItem(payload, BUYER, addInput({ quantity: 2 }));
		expect(cartsOf(payload)[0].items).toHaveLength(1);
		expect(cartsOf(payload)[0].items[0].quantity).toBe(3);
		expect(view.lines[0].quantity).toBe(3);
	});

	it("refuses a second shop with cart.singleShop and names the shop already in the cart", async () => {
		const payload = world();
		secondShop(payload);
		await addCartItem(payload, BUYER, addInput());
		await expect(
			addCartItem(
				payload,
				BUYER,
				addInput({ listingId: "l-2", variantId: "v-2" }),
			),
		).rejects.toMatchObject({
			code: "cart.singleShop",
			status: 409,
			details: { currentShop: { id: "s-1", name: "Chez Awa" } },
		});
		// The refused add must not have touched the cart.
		expect(payload.store.carts[0].items).toHaveLength(1);
	});

	it("empties the cart first when replace is true", async () => {
		const payload = world();
		secondShop(payload);
		await addCartItem(payload, BUYER, addInput());
		const view = await addCartItem(
			payload,
			BUYER,
			addInput({ listingId: "l-2", variantId: "v-2", replace: true }),
		);
		expect(payload.store.carts).toHaveLength(1);
		expect(view.lines).toHaveLength(1);
		expect(view.lines[0].variantId).toBe("v-2");
	});

	it("refuses a quantity above availability with cart.outOfStock and maxQuantity", async () => {
		const payload = world({ variant: { stockOnHand: 3, stockReserved: 0 } });
		await expect(
			addCartItem(payload, BUYER, addInput({ quantity: 4 })),
		).rejects.toMatchObject({
			code: "cart.outOfStock",
			status: 409,
			details: { maxQuantity: 3 },
		});
	});

	it.each([
		0, 21,
	])("refuses quantity %i with cart.quantityInvalid", async (quantity) => {
		const payload = world();
		await expect(
			addCartItem(payload, BUYER, addInput({ quantity })),
		).rejects.toMatchObject({ code: "cart.quantityInvalid", status: 400 });
	});
});

describe("addCartItem: orderability — one reason, one test", () => {
	it("unpublished listing", async () => {
		const payload = world({ listing: { status: "draft" } });
		await expect(addCartItem(payload, BUYER, addInput())).rejects.toMatchObject(
			{ code: "cart.itemUnavailable", status: 409 },
		);
	});

	it("shop not active", async () => {
		const payload = world({ shop: { status: "suspended" } });
		await expect(addCartItem(payload, BUYER, addInput())).rejects.toMatchObject(
			{ code: "cart.itemUnavailable", status: 409 },
		);
	});

	it("shop restricted", async () => {
		const payload = world({
			shop: { ordersRestrictedAt: "2026-01-01T00:00:00.000Z" },
		});
		await expect(addCartItem(payload, BUYER, addInput())).rejects.toMatchObject(
			{ code: "cart.itemUnavailable", status: 409 },
		);
	});

	it("codEnabled false", async () => {
		const payload = world({ shop: { orderSettings: { codEnabled: false } } });
		await expect(addCartItem(payload, BUYER, addInput())).rejects.toMatchObject(
			{ code: "cart.itemUnavailable", status: 409 },
		);
	});

	it("city not a launch city", async () => {
		const payload = world({ shop: { location: { city: "yaounde" } } });
		await expect(addCartItem(payload, BUYER, addInput())).rejects.toMatchObject(
			{ code: "cart.itemUnavailable", status: 409 },
		);
	});

	it("codAllowed false", async () => {
		const payload = world({ product: { delivery: { codAllowed: false } } });
		await expect(addCartItem(payload, BUYER, addInput())).rejects.toMatchObject(
			{ code: "cart.itemUnavailable", status: 409 },
		);
	});

	it("no available variant (archived)", async () => {
		const payload = world({
			variant: { archivedAt: "2026-01-01T00:00:00.000Z" },
		});
		await expect(addCartItem(payload, BUYER, addInput())).rejects.toMatchObject(
			{ code: "cart.itemUnavailable", status: 409 },
		);
	});
});

describe("addCartItem: self-purchase", () => {
	it.each([
		"owner",
		"manager",
		"staff",
	] as const)("refuses a %s of the listing's shop with checkout.selfPurchase", async (role) => {
		const payload = world({
			extraUsers: [{ id: "u-member", name: "Member" }],
			extraShopMembers: [
				{
					id: "m-extra",
					shop: "s-1",
					user: "u-member",
					role,
					status: "active",
				},
			],
		});
		await expect(
			addCartItem(payload, { id: "u-member" }, addInput()),
		).rejects.toMatchObject({ code: "checkout.selfPurchase", status: 403 });
	});
});

describe("addCartItem: checkout.disabled", () => {
	it("answers checkout.disabled when the flag is off", async () => {
		const payload = world({ ordersEnabled: false });
		await expect(addCartItem(payload, BUYER, addInput())).rejects.toMatchObject(
			{ code: "checkout.disabled", status: 403 },
		);
	});
});

describe("the five routes answer checkout.disabled when the flag is off", () => {
	it("GET /api/cart (getCartView)", async () => {
		const payload = world({ ordersEnabled: false });
		await expect(getCartView(payload, BUYER)).rejects.toMatchObject({
			code: "checkout.disabled",
		});
	});

	it("POST /api/cart/items (addCartItem)", async () => {
		const payload = world({ ordersEnabled: false });
		await expect(addCartItem(payload, BUYER, addInput())).rejects.toMatchObject(
			{ code: "checkout.disabled" },
		);
	});

	it("PATCH /api/cart/items/{lineId} (setCartItemQuantity)", async () => {
		const payload = world({ ordersEnabled: false });
		await expect(
			setCartItemQuantity(payload, BUYER, "any", 2),
		).rejects.toMatchObject({ code: "checkout.disabled" });
	});

	it("DELETE /api/cart/items/{lineId} (removeCartItem)", async () => {
		const payload = world({ ordersEnabled: false });
		await expect(removeCartItem(payload, BUYER, "any")).rejects.toMatchObject({
			code: "checkout.disabled",
		});
	});

	it("DELETE /api/cart (clearCart)", async () => {
		const payload = world({ ordersEnabled: false });
		await expect(clearCart(payload, BUYER)).rejects.toMatchObject({
			code: "checkout.disabled",
		});
	});
});

describe("loadActiveCart", () => {
	it("returns null when the user has no active cart", async () => {
		const payload = world();
		expect(await loadActiveCart(payload, "u-buyer")).toBeNull();
	});

	it("returns the active cart Tasks 18 and 19 load", async () => {
		const payload = world();
		await addCartItem(payload, BUYER, addInput());
		const cart = await loadActiveCart(payload, "u-buyer");
		expect(cart?.status).toBe("active");
		expect(cart?.items).toHaveLength(1);
	});
});

describe("reading a cart: price is a quote, not a promise", () => {
	it("returns the current price and flags priceChanged without rewriting priceAtAdd", async () => {
		const payload = world();
		await addCartItem(payload, BUYER, addInput());
		const stored = mustFind(variantsOf(payload), "v-1");
		stored.price = 15_000;

		const view = await getCartView(payload, BUYER);
		expect(view.lines[0].priceAtAdd).toBe(10_000);
		expect(view.lines[0].unitPrice).toBe(15_000);
		expect(view.lines[0].priceChanged).toBe(true);

		// The stored line itself stays untouched.
		expect(cartsOf(payload)[0].items[0].priceAtAdd).toBe(10_000);
	});

	it("flags an archived variant as unavailable rather than dropping the line", async () => {
		const payload = world();
		await addCartItem(payload, BUYER, addInput());
		const stored = mustFind(variantsOf(payload), "v-1");
		stored.archivedAt = "2026-02-01T00:00:00.000Z";

		const view = await getCartView(payload, BUYER);
		expect(view.lines).toHaveLength(1);
		expect(view.lines[0].available).toBe(false);
		expect(view.subtotal).toBe(0);
	});

	it("flags a line whose variant went out of stock as unavailable rather than dropping it", async () => {
		const payload = world();
		await addCartItem(payload, BUYER, addInput({ quantity: 2 }));
		const stored = mustFind(variantsOf(payload), "v-1");
		stored.stockOnHand = 0;

		const view = await getCartView(payload, BUYER);
		expect(view.lines).toHaveLength(1);
		expect(view.lines[0].available).toBe(false);
		expect(view.lines[0].maxQuantity).toBe(0);
		expect(view.subtotal).toBe(0);
	});
});

describe("revalidateCartLines", () => {
	it("returns an empty array for a null cart", async () => {
		const payload = world();
		expect(await revalidateCartLines(payload, null)).toEqual([]);
	});
});

describe("setCartItemQuantity / removeCartItem / clearCart", () => {
	it("updates a line's quantity, revalidating availability", async () => {
		const payload = world();
		await addCartItem(payload, BUYER, addInput({ quantity: 1 }));
		const lineId = cartsOf(payload)[0].items[0].id;
		const view = await setCartItemQuantity(payload, BUYER, lineId, 4);
		expect(view.lines[0].quantity).toBe(4);
	});

	it("refuses to raise a line above availability", async () => {
		const payload = world({ variant: { stockOnHand: 2, stockReserved: 0 } });
		await addCartItem(payload, BUYER, addInput({ quantity: 1 }));
		const lineId = cartsOf(payload)[0].items[0].id;
		await expect(
			setCartItemQuantity(payload, BUYER, lineId, 3),
		).rejects.toMatchObject({ code: "cart.outOfStock" });
	});

	it("removes a line", async () => {
		const payload = world();
		await addCartItem(payload, BUYER, addInput());
		const lineId = cartsOf(payload)[0].items[0].id;
		const view = await removeCartItem(payload, BUYER, lineId);
		expect(view.lines).toHaveLength(0);
		expect(payload.store.carts[0].items).toHaveLength(0);
	});

	it("answers generic.notFound for a lineId that does not belong to the caller's cart", async () => {
		const payload = world();
		await addCartItem(payload, BUYER, addInput());
		await expect(
			setCartItemQuantity(payload, { id: "u-someone-else" }, "nope", 2),
		).rejects.toMatchObject({ code: "generic.notFound", status: 404 });
		await expect(
			removeCartItem(payload, { id: "u-someone-else" }, "nope"),
		).rejects.toMatchObject({ code: "generic.notFound", status: 404 });
	});

	it("clears every line", async () => {
		const payload = world();
		await addCartItem(payload, BUYER, addInput());
		const view = await clearCart(payload, BUYER);
		expect(view.lines).toHaveLength(0);
		expect(payload.store.carts[0].items).toHaveLength(0);
	});
});

describe("one active cart per user, enforced by the database", () => {
	it("two concurrent adds for a user with no cart yet create only one cart", async () => {
		const payload = world();
		payload.store["product-variants"].push({
			id: "v-2",
			product: "p-1",
			shop: "s-1",
			price: 3_000,
			trackInventory: true,
			stockOnHand: 5,
			stockReserved: 0,
			archivedAt: null,
		});

		const [first, second] = await Promise.all([
			addCartItem(payload, BUYER, addInput({ variantId: "v-1" })),
			addCartItem(payload, BUYER, addInput({ variantId: "v-2" })),
		]);

		expect(payload.store.carts).toHaveLength(1);
		expect(first.id).toBe(second.id);
		const variantIds = cartsOf(payload)[0]
			.items.map((item) => item.variant)
			.sort();
		expect(variantIds).toEqual(["v-1", "v-2"]);
	});
});
