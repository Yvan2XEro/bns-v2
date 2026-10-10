// @vitest-environment node
import { describe, expect, it } from "vitest";
import { launchCitySeedRows } from "../../src/lib/launchCities";
import {
	addCartItem,
	addCartItemResponse,
	clearCart,
	getCartResponse,
	getCartView,
	removeCartItem,
} from "../../src/services/cart";
import { cmMarketRow, fakePayload, rwMarketRow } from "./helpers/fakePayload";

const buyer = { id: "buyer" };

const kigali = {
	id: "rw:kigali",
	market: "market-rw",
	key: "kigali",
	label: "Kigali",
	defaultDeliveryFee: 1200,
	districts: [],
	active: true,
	sortOrder: 0,
};

const shop = (id: string, city = "douala", extra: object = {}) => ({
	id,
	owner: `${id}-owner`,
	name: `Shop ${id}`,
	handle: `shop-${id}`,
	status: "active",
	level: 2,
	location: { city },
	orderSettings: { codEnabled: true },
	...extra,
});

const ownVariant = (id: string, shopId: string, price: number) => ({
	id: `v-${id}`,
	product: `p-${id}`,
	shop: shopId,
	price,
	trackInventory: false,
	archivedAt: null,
});
const ownProduct = (id: string, shopId: string) => ({
	id: `p-${id}`,
	shop: shopId,
	status: "active",
	delivery: { codAllowed: true },
});
const ownListing = (id: string, shopId: string) => ({
	id: `l-${id}`,
	shop: shopId,
	product: `p-${id}`,
	title: `Item ${id}`,
	status: "published",
});

/** A (own 25 000), B (own 15 000) and a resale listing on A sourced from C (7 000). */
function world(flag: boolean, extraSeed: Record<string, object[]> = {}) {
	return fakePayload(
		{
			users: [{ id: "buyer" }],
			shops: [shop("a"), shop("b"), shop("c", "douala", { level: 3 })],
			products: [
				ownProduct("a", "a"),
				ownProduct("b", "b"),
				{
					...ownProduct("c", "c"),
					resale: { enabled: true, codAccepted: true },
				},
			],
			"product-variants": [
				ownVariant("a", "a", 25_000),
				ownVariant("b", "b", 15_000),
				{
					...ownVariant("c", "c", 9000),
					resale: {
						enabled: true,
						supplierPrice: 4000,
						minRetailPrice: 6500,
						suggestedRetailPrice: 7500,
					},
				},
			],
			listings: [
				ownListing("a", "a"),
				ownListing("b", "b"),
				{
					id: "l-res",
					shop: "a",
					product: "p-c",
					title: "Item c",
					status: "published",
					resale: {
						supplierShop: "c",
						link: "link",
						prices: [{ variant: "v-c", price: 7000 }],
						holds: [],
					},
				},
			],
			"resale-links": [
				{
					id: "link",
					supplierShop: "c",
					resellerShop: "a",
					status: "approved",
					riskHold: false,
				},
			],
			"resale-terms": [
				{
					id: "rt",
					role: "reseller",
					version: "v1",
					publishedAt: "2026-01-01T00:00:00Z",
				},
				{
					id: "st",
					role: "supplier",
					version: "v1",
					publishedAt: "2026-01-01T00:00:00Z",
				},
			],
			"resale-terms-acceptances": [
				{ id: "ra", role: "reseller", shop: "a", version: "v1" },
				{ id: "sa", role: "supplier", shop: "c", version: "v1" },
			],
			carts: [],
			...extraSeed,
		},
		{
			uniques: { carts: [["user", "status"]] },
			globals: {
				"app-settings": {
					orders: {
						enabled: true,
						multiShopCartEnabled: flag,
						launchCities: [{ key: "douala", deliveryFee: 2000 }],
					},
					resale: { enabled: true },
				},
			},
		},
	);
}

const add = (listingId: string, variantId: string, quantity = 1) => ({
	listingId,
	variantId,
	quantity,
});

describe("flag off: today's cart, byte for byte", () => {
	it("answers the pre-P10 CartView for a single-shop cart", async () => {
		const payload = world(false);
		await addCartItem(payload, buyer, add("l-a", "v-a", 2));
		const view = await getCartView(payload, buyer);
		expect(view).toEqual({
			id: expect.any(String),
			shop: { id: "a", name: "Shop a", handle: "shop-a", city: "douala" },
			lines: [
				{
					id: expect.any(String),
					listingId: "l-a",
					productId: "p-a",
					variantId: "v-a",
					shopId: "a",
					title: "Item a",
					variantLabel: "",
					imageUrl: null,
					quantity: 2,
					unitPrice: 25_000,
					priceAtAdd: 25_000,
					priceChanged: false,
					lineSubtotal: 50_000,
					available: true,
					maxQuantity: null,
				},
			],
			subtotal: 50_000,
			shopOrderable: true,
			currency: "XAF",
		});
	});

	it("still refuses a second shop with cart.singleShop", async () => {
		const payload = world(false);
		await addCartItem(payload, buyer, add("l-a", "v-a"));
		await expect(
			addCartItem(payload, buyer, add("l-b", "v-b")),
		).rejects.toMatchObject({ code: "cart.singleShop", status: 409 });
	});

	it("still refuses a second fulfilling shop on the same storefront with cart.singleFulfilment", async () => {
		const payload = world(false);
		await addCartItem(payload, buyer, add("l-a", "v-a"));
		await expect(
			addCartItem(payload, buyer, add("l-res", "v-c")),
		).rejects.toMatchObject({ code: "cart.singleFulfilment", status: 409 });
	});
});

describe("flag on: lines group by (storefront, fulfilling)", () => {
	it("builds the worked split cart", async () => {
		const payload = world(true);
		await addCartItemResponse(payload, buyer, add("l-a", "v-a"));
		await addCartItemResponse(payload, buyer, add("l-b", "v-b"));
		await addCartItemResponse(payload, buyer, add("l-res", "v-c"));
		const view = await getCartResponse(payload, buyer);
		if (!("groups" in view)) throw new Error("expected a split view");
		expect(view.market).toEqual({ countryCode: "CM", currency: "XAF" });
		expect(view.groups.map((g) => g.groupKey)).toEqual(["a:a", "b:b", "a:c"]);
		expect(view.groups.map((g) => g.subtotal)).toEqual([25_000, 15_000, 7000]);
		expect(view.grandSubtotal).toBe(47_000);
		const resale = view.groups[2];
		expect(resale.resale).toBe(true);
		expect(resale.storefrontShop.id).toBe("a");
		expect(resale.fulfillingShop.id).toBe("c");
		expect(view.groups[0].resale).toBe(false);
		expect(view.groups[0].items).toHaveLength(1);
	});

	it("refuses a 6th group with cart.shopLimitReached and leaves the cart alone", async () => {
		const ids = ["s1", "s2", "s3", "s4", "s5", "s6"];
		const payload = world(true, {
			shops: [shop("a"), shop("b"), shop("c"), ...ids.map((id) => shop(id))],
			products: [ownProduct("a", "a"), ...ids.map((id) => ownProduct(id, id))],
			"product-variants": [
				ownVariant("a", "a", 1000),
				...ids.map((id) => ownVariant(id, id, 1000)),
			],
			listings: [ownListing("a", "a"), ...ids.map((id) => ownListing(id, id))],
		});
		for (const id of ids.slice(0, 5))
			await addCartItemResponse(payload, buyer, add(`l-${id}`, `v-${id}`));
		const before = (payload.store.carts[0] as { items: unknown[] }).items
			.length;
		await expect(
			addCartItemResponse(payload, buyer, add("l-s6", "v-s6")),
		).rejects.toMatchObject({ code: "cart.shopLimitReached", status: 409 });
		expect((payload.store.carts[0] as { items: unknown[] }).items).toHaveLength(
			before,
		);
		expect(before).toBe(5);
		// a line merging into an existing group is still fine
		await addCartItemResponse(payload, buyer, add("l-s1", "v-s1"));
	});

	it("refuses a 31st line with cart.shopLimitReached", async () => {
		const variants = Array.from({ length: 31 }, (_, i) => ({
			...ownVariant("a", "a", 1000),
			id: `v-n${i}`,
		}));
		const payload = world(true, {
			"product-variants": variants,
			products: [ownProduct("a", "a")],
			listings: [ownListing("a", "a")],
		});
		for (let i = 0; i < 30; i++)
			await addCartItemResponse(payload, buyer, add("l-a", `v-n${i}`));
		await expect(
			addCartItemResponse(payload, buyer, add("l-a", "v-n30")),
		).rejects.toMatchObject({ code: "cart.shopLimitReached" });
		expect((payload.store.carts[0] as { items: unknown[] }).items).toHaveLength(
			30,
		);
		// merging into an existing line at the ceiling is allowed
		await addCartItemResponse(payload, buyer, add("l-a", "v-n0"));
	});
});

describe.each([false, true])("market binding, flag %s", (flag) => {
	const rwWorld = () =>
		world(flag, {
			markets: [cmMarketRow(), rwMarketRow()],
			"market-cities": [...launchCitySeedRows("market-cm"), kigali],
			shops: [
				shop("a"),
				shop("b"),
				shop("c", "douala", { level: 3 }),
				shop("k", "kigali", {
					location: { city: "kigali", countryCode: "RW" },
				}),
			],
			products: [ownProduct("a", "a"), ownProduct("k", "k")],
			"product-variants": [
				ownVariant("a", "a", 1000),
				ownVariant("k", "k", 1000),
			],
			listings: [ownListing("a", "a"), ownListing("k", "k")],
		});

	it("stores the market at the first add", async () => {
		const payload = rwWorld();
		await addCartItem(payload, buyer, add("l-a", "v-a"));
		expect((payload.store.carts[0] as { market?: unknown }).market).toBe(
			"market-cm",
		);
	});

	it("refuses a line from another market with cart.marketMismatch", async () => {
		const payload = rwWorld();
		await addCartItem(payload, buyer, add("l-a", "v-a"));
		await expect(
			addCartItem(payload, buyer, add("l-k", "v-k")),
		).rejects.toMatchObject({
			code: "cart.marketMismatch",
			status: 409,
			details: { cartMarket: { id: "market-cm", countryCode: "CM" } },
		});
	});

	it("empties back to no market", async () => {
		const payload = rwWorld();
		const first = await addCartItem(payload, buyer, add("l-a", "v-a"));
		await removeCartItem(payload, buyer, first.lines[0].id);
		expect((payload.store.carts[0] as { market?: unknown }).market).toBeNull();
		await addCartItem(payload, buyer, add("l-k", "v-k")).catch(() => null);
		await clearCart(payload, buyer);
		expect((payload.store.carts[0] as { market?: unknown }).market).toBeNull();
	});
});
