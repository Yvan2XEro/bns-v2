// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { launchCitySeedRows } from "../../src/lib/launchCities";
import { invalidateMarketCache } from "../../src/lib/marketCache";
import { getOrderSettings } from "../../src/lib/orderSettings";
import { quoteHash } from "../../src/lib/quoteHash";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { shopCapabilities } from "../../src/lib/shopCapabilities";
import {
	addCartItem,
	addCartItemResponse,
	clearCart,
	getCartResponse,
	getCartView,
	removeCartItem,
	revalidateCartLines,
} from "../../src/services/cart";
import {
	quoteCheckout,
	quoteCheckoutResponse,
} from "../../src/services/checkout";
import {
	groupLines,
	quoteGroup,
	type SplitQuoteView,
} from "../../src/services/checkoutSplit";
import { cmMarketRow, fakePayload, rwMarketRow } from "./helpers/fakePayload";

const buyer = { id: "buyer" };

beforeEach(() => {
	process.env.ORDER_PHONE_PEPPER = "test-pepper";
});
afterEach(() => {
	process.env.ORDER_PHONE_PEPPER = undefined;
});

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
			shop: {
				id: "a",
				name: "Shop a",
				handle: "shop-a",
				city: "douala",
				logoUrl: null,
				badge: "identity",
				rating: 0,
				totalReviews: 0,
			},
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
					stockLeft: null,
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

const NOW = new Date("2026-10-02T10:00:00.000Z");
const SELLER = {
	codEnabled: true,
	sellerDeliveryEnabled: true,
	deliveryFee: null,
	deliveryEtaText: "24-48h",
	pickupEnabled: false,
	salesTermsExtra: null,
};
const address = {
	recipientName: "Jean Mballa",
	phone: "+237670000001",
	city: "douala",
	district: "douala.akwa",
	landmark: "Pres de la pharmacie du carrefour",
	instructions: "Appeler avant livraison",
};
const quoteInput = (extra: object = {}) => ({
	address,
	deliveryOptionId: "seller_delivery:douala",
	paymentMethod: "cod",
	...extra,
});

function quoteWorld(flag: boolean) {
	return world(flag, {
		users: [
			{
				id: "buyer",
				name: "Buyer",
				phone: "+237670000001",
				phoneVerifiedAt: NOW.toISOString(),
			},
		],
		shops: [
			shop("a", "douala", { orderSettings: SELLER }),
			shop("b", "douala", { orderSettings: SELLER }),
			shop("c", "douala", { level: 3, orderSettings: SELLER }),
		],
		"buyer-phone-scores": [],
		orders: [],
	});
}

function rowOf(
	payload: ReturnType<typeof quoteWorld>,
	collection: string,
	id: string,
) {
	const row = payload.store[collection].find((r) => r.id === id);
	if (!row) throw new Error(`${collection}/${id} is not seeded`);
	return row;
}

const splitOf = async (
	payload: ReturnType<typeof quoteWorld>,
	extra: object = {},
): Promise<SplitQuoteView> => {
	const view = await quoteCheckoutResponse(payload, buyer, quoteInput(extra), {
		now: NOW,
		store: new MemoryCounterStore(),
	});
	if (!("groups" in view)) throw new Error("expected a split quote");
	return view;
};

async function filledWorld(flag = true) {
	const payload = quoteWorld(flag);
	await addCartItem(payload, buyer, add("l-a", "v-a"));
	if (flag) {
		await addCartItem(payload, buyer, add("l-b", "v-b"));
		await addCartItem(payload, buyer, add("l-res", "v-c"));
	}
	return payload;
}

function withZones(payload: ReturnType<typeof quoteWorld>) {
	payload.globals["app-settings"].delivery = { zonesEnabled: true };
	payload.store["shop-locations"] = [];
	payload.store["delivery-zones"] = ["a", "b", "c"].map((id) => ({
		id: `zone-${id}`,
		shop: id,
		name: "Whole city",
		scope: "same_city",
		city: "douala",
		districts: [],
		method: "seller_delivery",
		fee: 2000,
		etaMinHours: 4,
		etaMaxHours: 8,
		deliveryDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
		active: true,
		codAllowed: true,
		updatedAt: NOW.toISOString(),
	}));
}

describe("flag on: one quote per group", () => {
	it("quotes the worked fixture group by group", async () => {
		const quote = await splitOf(await filledWorld());
		expect(quote.market).toEqual({ countryCode: "CM", currency: "XAF" });
		expect(quote.groups.map((g) => g.groupKey)).toEqual(["a:a", "b:b", "a:c"]);
		expect(quote.groups.map((g) => g.deliveryFee)).toEqual([2000, 2000, 2000]);
		expect(quote.groups.map((g) => g.total)).toEqual([27_000, 17_000, 9000]);
		expect(quote.grandTotal).toBe(53_000);
		expect(quote.unavailableGroups).toEqual([]);
		expect(quote.quoteHash).toMatch(/^[0-9a-f]{64}$/);
		const resale = quote.groups[2];
		expect(resale.resale).toBe(true);
		expect(resale.fulfillingShop.id).toBe("c");
		expect(resale.storefrontShop.id).toBe("a");
		expect(resale.items).toHaveLength(1);
		expect(new Set(quote.groups.map((g) => g.quoteHash)).size).toBe(3);
	});

	it("lists a deactivated shop under unavailableGroups and leaves it out of the total", async () => {
		const payload = await filledWorld();
		rowOf(payload, "shops", "b").status = "suspended";
		const quote = await splitOf(payload);
		expect(quote.groups.map((g) => g.groupKey)).toEqual(["a:a", "a:c"]);
		expect(quote.unavailableGroups).toEqual([
			{ groupKey: "b:b", reason: "order.shopUnavailable" },
		]);
		expect(quote.grandTotal).toBe(36_000);
	});

	it("lists a group whose picked option is not offered, and honours a valid pick", async () => {
		const payload = await filledWorld();
		const quote = await splitOf(payload, {
			deliveryByGroup: { "b:b": "courier:nope" },
		});
		expect(quote.unavailableGroups).toEqual([
			{ groupKey: "b:b", reason: "checkout.methodUnavailable" },
		]);
		const picked = await splitOf(payload, {
			deliveryByGroup: { "a:a": "seller_delivery:douala" },
		});
		expect(picked.groups[0].selectedOptionId).toBe("seller_delivery:douala");
	});

	it("lists a group whose stock ran out after it was carted", async () => {
		const payload = await filledWorld();
		const variant = rowOf(payload, "product-variants", "v-b");
		variant.trackInventory = true;
		variant.stockOnHand = 0;
		variant.stockReserved = 0;
		const quote = await splitOf(payload);
		expect(quote.unavailableGroups).toEqual([
			{ groupKey: "b:b", reason: "cart.outOfStock" },
		]);
		expect(quote.grandTotal).toBe(36_000);
	});

	it("moves the hash on a zone edit, and only on an edit", async () => {
		const payload = await filledWorld();
		withZones(payload);
		const first = await splitOf(payload);
		expect((await splitOf(payload)).quoteHash).toBe(first.quoteHash);
		payload.store["delivery-zones"][0].updatedAt = "2026-10-02T11:00:00.000Z";
		const second = await splitOf(payload);
		expect(second.quoteHash).not.toBe(first.quoteHash);
		expect(second.groups[0].quoteHash).not.toBe(first.groups[0].quoteHash);
		expect(second.groups[1].quoteHash).toBe(first.groups[1].quoteHash);
	});

	it("moves the hash when only the last group changes", async () => {
		const payload = await filledWorld();
		const first = await splitOf(payload);
		rowOf(payload, "product-variants", "v-b").price = 16_000;
		const second = await splitOf(payload);
		expect(second.groups[0].quoteHash).toBe(first.groups[0].quoteHash);
		expect(second.groups[1].quoteHash).not.toBe(first.groups[1].quoteHash);
		expect(second.quoteHash).not.toBe(first.quoteHash);
	});

	it("moves every hash when the market row is edited", async () => {
		const payload = await filledWorld();
		const first = await splitOf(payload);
		payload.store.markets[0].updatedAt = "2026-10-10T10:00:00.000Z";
		invalidateMarketCache(payload);
		const second = await splitOf(payload);
		expect(second.quoteHash).not.toBe(first.quoteHash);
		for (const [i, group] of second.groups.entries())
			expect(group.quoteHash).not.toBe(first.groups[i].quoteHash);
	});

	it("binds a group hash to its group identity", () => {
		const input = {
			lines: [{ lineId: "l", variantId: "v", quantity: 1, unitPrice: 100 }],
			deliveryFee: 2000,
			method: "seller_delivery" as const,
			city: "douala",
			paymentMethod: "cod" as const,
			termsVersion: "t",
			marketUpdatedAt: "m",
		};
		expect(quoteHash({ ...input, groupKey: "a:a" })).not.toBe(
			quoteHash({ ...input, groupKey: "b:b" }),
		);
		expect(quoteHash({ ...input, groupKey: "a:a" })).toBe(
			quoteHash({ ...input, groupKey: "a:a" }),
		);
	});

	it("refuses a group assembling two fulfilling shops as an integrity error", async () => {
		const payload = await filledWorld();
		const cart = await payload.findByID({
			collection: "carts",
			id: String(payload.store.carts[0].id),
			depth: 0,
			overrideAccess: true,
		});
		const lines = await revalidateCartLines(payload, cart);
		const [own, , resale] = lines;
		const storefront = await payload.findByID({
			collection: "shops",
			id: "a",
			depth: 0,
			overrideAccess: true,
		});
		await expect(
			quoteGroup(
				payload,
				buyer,
				quoteInput(),
				{
					settings: await getOrderSettings(payload),
					lines: [own, resale],
					shop: storefront,
					capabilities: shopCapabilities(storefront, NOW),
				},
				{ groupKey: "a:a" },
				NOW,
			),
		).rejects.toMatchObject({ code: "cart.singleFulfilment" });
		expect(groupLines(lines).map((g) => g.lines.length)).toEqual([1, 1, 1]);
	});
});

describe("flag off: the quote is today's quote, byte for byte", () => {
	it("answers the flat QuoteResponse through the flag dispatch", async () => {
		const payload = await filledWorld(false);
		const direct = await quoteCheckout(payload, buyer, quoteInput(), {
			now: NOW,
		});
		const dispatched = await quoteCheckoutResponse(
			payload,
			buyer,
			quoteInput(),
			{
				now: NOW,
			},
		);
		expect(JSON.stringify(dispatched)).toBe(JSON.stringify(direct));
		expect(JSON.stringify(direct.summary.amounts)).toBe(
			'{"subtotal":25000,"deliveryFee":2000,"discount":0,"buyerProtectionFee":0,"total":27000,"currency":"XAF"}',
		);
		expect("groups" in dispatched).toBe(false);
	});
});
