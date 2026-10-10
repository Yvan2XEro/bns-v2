// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendSms } = vi.hoisted(() => ({ sendSms: vi.fn() }));
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: vi.fn(async () => undefined),
	hasPushCredential: vi.fn(async () => true),
}));
vi.mock("../../src/hooks/searchEvents", () => ({
	queueSearchEvent: vi.fn(async () => undefined),
}));

import { invalidateMarketCache } from "../../src/lib/marketCache";
import { hashDeliveryPhone } from "../../src/lib/phoneHash";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { addCartItem } from "../../src/services/cart";
import {
	type CheckoutPlaceInput,
	placeCheckoutResponse,
	quoteCheckoutResponse,
} from "../../src/services/checkout";
import {
	placeGroups,
	planSplit,
	type SplitPlaceResponse,
	type SplitQuoteView,
} from "../../src/services/checkoutSplit";
import { __resetOrderEventHandlers } from "../../src/services/orders/events";
import { normalizePhoneNumber } from "../../src/services/phoneVerification";
import {
	cmMarketRow,
	type FakePayload,
	fakePayload,
} from "./helpers/fakePayload";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const PEPPER = "test-pepper";
const PHONE = "+237670000001";
const buyer = { id: "u1" };
const rival = { id: "u2" };

beforeEach(() => {
	process.env.ORDER_PHONE_PEPPER = PEPPER;
	__resetOrderEventHandlers();
	vi.stubEnv("PROTECTED_PAYMENT_ALLOWED", "true");
});
afterEach(() => {
	process.env.ORDER_PHONE_PEPPER = undefined;
	vi.unstubAllEnvs();
});

const SELLER = {
	codEnabled: true,
	sellerDeliveryEnabled: true,
	deliveryFee: null,
	deliveryEtaText: "24-48h",
	pickupEnabled: false,
	salesTermsExtra: null,
};
const shop = (id: string, level = 2) => ({
	id,
	owner: `${id}-owner`,
	name: `Shop ${id}`,
	handle: `shop-${id}`,
	status: "active",
	level,
	location: { city: "douala", countryCode: "CM" },
	orderSettings: SELLER,
});
const product = (id: string, shopId: string, extra: object = {}) => ({
	id: `p-${id}`,
	shop: shopId,
	status: "active",
	delivery: { codAllowed: true },
	...extra,
});
const variant = (
	id: string,
	shopId: string,
	price: number,
	stock: number,
	extra: object = {},
) => ({
	id: `v-${id}`,
	product: `p-${id}`,
	shop: shopId,
	price,
	sku: `SKU-${id}`,
	trackInventory: true,
	stockOnHand: stock,
	stockReserved: 0,
	archivedAt: null,
	...extra,
});
const listing = (id: string, shopId: string, extra: object = {}) => ({
	id: `l-${id}`,
	shop: shopId,
	product: `p-${id}`,
	title: `Item ${id}`,
	status: "published",
	...extra,
});

const GATES = ["G1", "G2", "G3", "G4", "G5", "G6"].map((gate) => ({
	gate,
	clearedAt: "2026-09-30T00:00:00.000Z",
	clearedBy: "admin",
	evidence: `ev-${gate}`,
	note: null,
}));
const openPayments = () => ({
	protectedPayment: { enabled: true },
	releaseModel: "provider_hold",
	markets: [
		{
			countryCode: "CM",
			currency: "XAF",
			provider: "notchpay",
			settlementMode: "provider_split",
			channels: ["cm.mtn", "cm.orange"],
			vatRateBps: 1925,
			enabled: true,
		},
	],
	gates: GATES,
});

const trusted = {
	phoneHash: hashDeliveryPhone(PEPPER, normalizePhoneNumber(PHONE)),
	ordersPlaced: 3,
	ordersDelivered: 3,
	cancelledAfterAccept: 0,
	blockedOverride: "none",
	refusals: [],
};

type WorldOptions = {
	raceStock?: number;
	orders?: Record<string, unknown>[];
	buyerCaps?: Record<string, unknown>;
	payments?: boolean;
	multiShop?: boolean;
	shopCaps?: Record<string, unknown>;
};

/** A (own 25 000), B (own 15 000, the race variant), a resale line on A supplied by C (7 000). */
function world(options: WorldOptions = {}) {
	return fakePayload(
		{
			users: [
				{
					id: "u1",
					name: "Buyer",
					phone: PHONE,
					phoneVerifiedAt: NOW.toISOString(),
				},
				{
					id: "u2",
					name: "Rival",
					phone: PHONE,
					phoneVerifiedAt: NOW.toISOString(),
				},
			],
			shops: [shop("a"), shop("b"), shop("c", 3)],
			products: [
				product("a", "a"),
				product("b", "b"),
				product("c", "c", { resale: { enabled: true, codAccepted: true } }),
			],
			"product-variants": [
				variant("a", "a", 25_000, 5),
				variant("b", "b", 15_000, options.raceStock ?? 1),
				variant("c", "c", 9000, 3, {
					resale: {
						enabled: true,
						supplierPrice: 4000,
						minRetailPrice: 6500,
						suggestedRetailPrice: 7500,
					},
				}),
			],
			listings: [
				listing("a", "a"),
				listing("b", "b"),
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
			"shop-members": [],
			carts: [],
			orders: options.orders ?? [],
			"order-items": [],
			"order-events": [],
			"stock-movements": [],
			sequences: [],
			"buyer-phone-scores": [trusted],
			markets: [cmMarketRow()],
			"connected-accounts": ["a", "b", "c"].map((id) => ({
				id: `ca-${id}`,
				shop: id,
				provider: "notchpay",
				providerAccountId: `acct_${id}`,
				status: "active",
				chargesEnabled: true,
				payoutsEnabled: true,
			})),
			"payout-accounts": ["a", "b", "c"].map((id) => ({
				id: `pa-${id}`,
				shop: id,
				status: "active",
				method: "mtn_momo",
			})),
			"payout-holds": [],
		},
		{
			uniques: {
				carts: [["user", "status"]],
				"buyer-phone-scores": [["phoneHash"]],
				orders: [["buyer", "idempotencyKey"]],
			},
			globals: {
				"app-settings": {
					orders: {
						enabled: true,
						multiShopCartEnabled: options.multiShop ?? true,
						launchCities: [{ key: "douala", deliveryFee: 2000 }],
						termsVersion: "2026-09",
						...(options.buyerCaps ? { buyerCaps: options.buyerCaps } : {}),
						...(options.shopCaps ? { shopCaps: options.shopCaps } : {}),
					},
					resale: { enabled: true },
					company: {
						legalName: "BuyNSellem SARL",
						supportEmail: "support@buynsellem.com",
						supportPhone: "+237600000000",
					},
					...(options.payments ? { payments: openPayments() } : {}),
				},
			},
			secret: "test-payload-secret",
		},
	);
}

const add = (listingId: string, variantId: string) => ({
	listingId,
	variantId,
	quantity: 1,
});
const ALL = [
	["l-a", "v-a"],
	["l-b", "v-b"],
	["l-res", "v-c"],
] as const;

async function fill(
	payload: FakePayload,
	user: { id: string },
	lines: ReadonlyArray<readonly [string, string]> = ALL,
) {
	for (const [l, v] of lines) await addCartItem(payload, user, add(l, v));
}

const address = {
	recipientName: "Jean Mballa",
	phone: PHONE,
	city: "douala",
	district: "douala.akwa",
	landmark: "Pres de la pharmacie du carrefour",
	instructions: "Appeler avant livraison",
};
let seq = 0;
const draft = (paymentMethod = "cod") => ({
	address,
	deliveryOptionId: "seller_delivery:douala",
	paymentMethod,
	locale: "fr",
});
const opts = () => ({ now: NOW, store: new MemoryCounterStore() });

async function placeInput(
	payload: FakePayload,
	user: { id: string },
	paymentMethod = "cod",
	extra: Record<string, unknown> = {},
): Promise<CheckoutPlaceInput> {
	const view = await quoteCheckoutResponse(
		payload,
		user,
		draft(paymentMethod),
		opts(),
	);
	if (!("groups" in view)) throw new Error("expected a split quote");
	seq += 1;
	return {
		...draft(paymentMethod),
		quoteHash: view.quoteHash,
		termsAccepted: true,
		idempotencyKey: `idem-${seq}`,
		...extra,
	};
}

async function place(
	payload: FakePayload,
	user: { id: string },
	input: CheckoutPlaceInput,
): Promise<SplitPlaceResponse> {
	const res = await placeCheckoutResponse(payload, user, input, opts());
	if (!("orders" in res)) throw new Error("expected a split placement");
	return res;
}

/** The few columns these specs read, off the fake's untyped rows. */
interface Row {
	id: string;
	shop: string;
	status: string;
	order: string;
	checkoutGroup?: string;
	market?: string;
	idempotencyKey?: string;
	fulfillingShop?: string;
	paymentMethod?: string;
	paymentStatus?: string;
	stockOnHand: number;
	stockReserved: number;
	ordersPlaced: number;
	price: number;
	currency: unknown;
	convertedOrders: unknown[];
	items: Array<{ shop: string }>;
	amounts: {
		currency: string;
		subtotal: number;
		total: number;
		buyerProtectionFee: number;
	};
}
const rows = (payload: FakePayload, collection: string): Row[] =>
	(payload.store[collection] ?? []) as unknown as Row[];
const variantRow = (payload: FakePayload, id: string): Row => {
	const row = rows(payload, "product-variants").find((v) => v.id === id);
	if (!row) throw new Error(`variant ${id} is not seeded`);
	return row;
};
const ordersOf = (payload: FakePayload, group: string) =>
	rows(payload, "orders").filter((o) => o.checkoutGroup === group);

describe("split placement, flag on", () => {
	it("places the worked fixture as three orders under one checkoutGroup", async () => {
		const payload = world();
		await fill(payload, buyer);
		const res = await place(payload, buyer, await placeInput(payload, buyer));

		expect(res.checkoutGroup).toBe("CHK-2610-000001");
		expect(res.orders).toEqual([
			{
				id: expect.any(String),
				orderNumber: expect.stringMatching(/^BNS-2610-/),
				shop: { id: "a", name: "Shop a", handle: "shop-a", city: "douala" },
				total: 27_000,
				currency: "XAF",
				paymentMethod: "cod",
			},
			{
				id: expect.any(String),
				orderNumber: expect.stringMatching(/^BNS-2610-/),
				shop: { id: "b", name: "Shop b", handle: "shop-b", city: "douala" },
				total: 17_000,
				currency: "XAF",
				paymentMethod: "cod",
			},
			{
				id: expect.any(String),
				orderNumber: expect.stringMatching(/^BNS-2610-/),
				shop: { id: "a", name: "Shop a", handle: "shop-a", city: "douala" },
				total: 9000,
				currency: "XAF",
				paymentMethod: "cod",
			},
		]);

		const orders = ordersOf(payload, res.checkoutGroup);
		expect(orders).toHaveLength(3);
		expect(orders.map((o) => o.shop)).toEqual(["a", "b", "a"]);
		expect(orders.every((o) => o.market === "market-cm")).toBe(true);
		expect(orders.map((o) => o.amounts.currency)).toEqual([
			"XAF",
			"XAF",
			"XAF",
		]);
		expect(orders.map((o) => o.amounts.subtotal)).toEqual([
			25_000, 15_000, 7000,
		]);
		expect(new Set(orders.map((o) => o.idempotencyKey)).size).toBe(3);

		const items = rows(payload, "order-items");
		expect(
			items.map((i) => [i.order === orders[0].id, i.fulfillingShop]),
		).toEqual([
			[true, "a"],
			[false, "b"],
			[false, "c"],
		]);
		expect(items[2]).toMatchObject({
			sourcing: "resale",
			supplierUnitPrice: 4000,
		});

		for (const id of ["a", "b", "c"]) {
			expect(variantRow(payload, `v-${id}`).stockReserved).toBe(1);
		}
		expect(rows(payload, "stock-movements")).toHaveLength(3);
		expect(rows(payload, "carts")[0].status).toBe("converted");
		expect(rows(payload, "carts")[0].convertedOrders).toHaveLength(3);
		expect(rows(payload, "buyer-phone-scores")[0].ordersPlaced).toBe(6);
	});

	it("answers a replayed idempotency key with the same group and creates nothing", async () => {
		const payload = world();
		await fill(payload, buyer);
		const input = await placeInput(payload, buyer);
		const first = await place(payload, buyer, input);
		const again = await place(payload, buyer, input);
		expect(again).toEqual(first);
		expect(rows(payload, "orders")).toHaveLength(3);
	});

	it("refuses a stale hash with the fresh quote and creates nothing", async () => {
		const payload = world();
		await fill(payload, buyer);
		const input = await placeInput(payload, buyer);
		rows(payload, "product-variants")[0].price = 26_000;
		rows(payload, "listings")[0].price = 26_000;
		await expect(
			place(payload, buyer, { ...input, quoteHash: "0".repeat(64) }),
		).rejects.toMatchObject({
			code: "checkout.quoteChanged",
			status: 409,
			details: { quote: { groups: expect.any(Array) } },
		});
		expect(rows(payload, "orders")).toHaveLength(0);
		expect(rows(payload, "stock-movements")).toHaveLength(0);
	});

	it("places the rest and keeps the unplaced lines when a group is unavailable", async () => {
		const payload = world();
		await fill(payload, buyer);
		rows(payload, "shops")[1].status = "suspended";
		const input = await placeInput(payload, buyer);
		const res = await place(payload, buyer, input);
		expect(res.orders.map((o) => o.total)).toEqual([27_000, 9000]);
		const cart = rows(payload, "carts")[0];
		expect(cart.status).toBe("active");
		expect(cart.items.map((i) => i.shop)).toEqual(["b"]);
	});

	it("refuses to place a group the quote listed as unavailable", async () => {
		const payload = world();
		await fill(payload, buyer);
		rows(payload, "shops")[1].status = "suspended";
		const input = await placeInput(payload, buyer, "cod", {
			groupKeys: ["b:b"],
		});
		await expect(place(payload, buyer, input)).rejects.toMatchObject({
			code: "checkout.groupUnavailable",
			details: { groupKey: "b:b", reason: "order.shopUnavailable" },
		});
		expect(rows(payload, "orders")).toHaveLength(0);
	});

	it("re-asserts the market at place: an invalidated row is market.unknown, nothing created", async () => {
		const payload = world();
		await fill(payload, buyer);
		const input = await placeInput(payload, buyer);
		rows(payload, "markets")[0].currency = {
			code: "bad",
			minorUnit: 0,
			rounding: "half_up",
		};
		invalidateMarketCache(payload);
		await expect(place(payload, buyer, input)).rejects.toMatchObject({
			code: "market.unknown",
		});
		expect(rows(payload, "orders")).toHaveLength(0);
	});
});

describe("the stock race (Review Focus 1)", () => {
	it("lets exactly one of two concurrent placements through, leaking nothing", async () => {
		const payload = world();
		await fill(payload, buyer);
		await fill(payload, rival);
		const [inA, inB] = [
			await placeInput(payload, buyer),
			await placeInput(payload, rival),
		];
		const settled = await Promise.allSettled([
			placeCheckoutResponse(payload, buyer, inA, opts()),
			placeCheckoutResponse(payload, rival, inB, opts()),
		]);
		const won = settled.filter((s) => s.status === "fulfilled");
		const lost = settled.filter((s) => s.status === "rejected");
		expect(won).toHaveLength(1);
		expect(lost).toHaveLength(1);
		expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({
			code: "checkout.stockChanged",
			status: 409,
			details: { variant: "v-b" },
		});

		const groups = new Set(rows(payload, "orders").map((o) => o.checkoutGroup));
		expect(groups.size).toBe(1);
		expect(rows(payload, "orders")).toHaveLength(3);
		expect(rows(payload, "order-items")).toHaveLength(3);
		for (const id of ["a", "b", "c"]) {
			expect(variantRow(payload, `v-${id}`).stockReserved).toBe(1);
		}
		expect(variantRow(payload, "v-b").stockOnHand).toBe(1);
		expect(rows(payload, "stock-movements")).toHaveLength(3);
	});

	it("reserves variants in one global sorted order whatever the group order", async () => {
		const payload = world();
		await fill(payload, buyer, [ALL[1], ALL[2], ALL[0]]);
		const calls: string[] = [];
		const real = payload.db.updateOne.bind(payload.db);
		payload.db.updateOne = (async (args: Parameters<typeof real>[0]) => {
			if (args.collection === "product-variants") {
				const id = JSON.stringify(args.where).match(/"v-[a-z]"/)?.[0];
				if (id) calls.push(id.replaceAll('"', ""));
			}
			return real(args);
		}) as typeof payload.db.updateOne;
		await place(payload, buyer, await placeInput(payload, buyer));
		expect(calls).toEqual(["v-a", "v-b", "v-c"]);
	});

	it("rolls every order back when a variant is taken between quote and reservation", async () => {
		const payload = world();
		await fill(payload, buyer);
		const plan = await planSplit(payload, buyer, draft(), opts());
		variantRow(payload, "v-b").stockOnHand = 0;
		await expect(
			placeGroups(
				payload,
				buyer,
				plan,
				plan.groups,
				{ idempotencyKey: "k", paymentMethod: "cod" },
				{ now: NOW },
			),
		).rejects.toMatchObject({
			code: "checkout.stockChanged",
			details: { variant: "v-b" },
		});
		expect(rows(payload, "orders")).toHaveLength(0);
		expect(rows(payload, "order-items")).toHaveLength(0);
		expect(variantRow(payload, "v-a").stockReserved).toBe(0);
		expect(rows(payload, "stock-movements")).toHaveLength(0);
	});
});

describe("one fulfilling shop per order (Review Focus 4)", () => {
	it("aborts every order when a group smuggles a second fulfilling shop", async () => {
		const payload = world();
		await fill(payload, buyer);
		const plan = await planSplit(payload, buyer, draft(), opts());
		const [, , resale] = plan.groups;
		// the resale group now carries an item fulfilled by another shop
		resale.quoted.internals.items.push({
			...resale.quoted.internals.items[0],
			lineId: "smuggled",
			resale: { supplierShop: "b", resaleLink: "link", supplierUnitPrice: 1 },
		});
		await expect(
			placeGroups(
				payload,
				buyer,
				plan,
				plan.groups,
				{ idempotencyKey: "k", paymentMethod: "cod" },
				{ now: NOW },
			),
		).rejects.toMatchObject({ code: "order.mixedFulfilment", status: 500 });
		expect(rows(payload, "orders")).toHaveLength(0);
		expect(rows(payload, "order-items")).toHaveLength(0);
		expect(rows(payload, "stock-movements")).toHaveLength(0);
		for (const id of ["a", "b", "c"]) {
			expect(variantRow(payload, `v-${id}`).stockReserved).toBe(0);
		}
	});

	it("never fires on a well-formed resale group", async () => {
		const payload = world();
		await fill(payload, buyer, [ALL[0], ALL[2]]);
		const res = await place(payload, buyer, await placeInput(payload, buyer));
		expect(res.orders).toHaveLength(2);
	});
});

describe("caps across the whole split", () => {
	it("refuses when the sum of groups crosses the buyer's open-order cap", async () => {
		const buyerCaps = { trusted: { maxOpenOrders: 2, maxOrderTotal: null } };
		const payload = world({ buyerCaps });
		await fill(payload, buyer);
		// each group alone is within the cap: the quote lists all three
		const view = await quoteCheckoutResponse(payload, buyer, draft(), opts());
		expect((view as SplitQuoteView).groups).toHaveLength(3);
		await expect(
			place(payload, buyer, await placeInput(payload, buyer)),
		).rejects.toMatchObject({ code: "order.buyerCapReached", status: 409 });
		expect(rows(payload, "orders")).toHaveLength(0);
		expect(variantRow(payload, "v-a").stockReserved).toBe(0);
	});

	it("places a split that sits exactly at the cap", async () => {
		const payload = world({
			buyerCaps: { trusted: { maxOpenOrders: 3, maxOrderTotal: null } },
		});
		await fill(payload, buyer);
		const res = await place(payload, buyer, await placeInput(payload, buyer));
		expect(res.orders).toHaveLength(3);
	});

	it("counts sibling orders to one storefront against the shop's daily cap", async () => {
		const payload = world({ shopCaps: { 2: { maxDailyOrders: 1 } } });
		await fill(payload, buyer, [ALL[0], ALL[2]]);
		// a:a and a:c are both orders of shop a; each is within a cap of one alone
		const view = await quoteCheckoutResponse(payload, buyer, draft(), opts());
		expect((view as SplitQuoteView).groups).toHaveLength(2);
		await expect(
			place(payload, buyer, await placeInput(payload, buyer)),
		).rejects.toMatchObject({ code: "order.shopCapReached", status: 409 });
		expect(rows(payload, "orders")).toHaveLength(0);
	});
});

describe("mobile_money, split", () => {
	it("places each group in the payable shape", async () => {
		const payload = world({ payments: true });
		await fill(payload, buyer, [ALL[0], ALL[1]]);
		const input = await placeInput(payload, buyer, "mobile_money");
		const view = await quoteCheckoutResponse(
			payload,
			buyer,
			draft("mobile_money"),
			opts(),
		);
		expect((view as SplitQuoteView).unavailableGroups).toEqual([]);
		const res = await place(payload, buyer, input);
		const orders = ordersOf(payload, res.checkoutGroup);
		expect(orders).toHaveLength(2);
		for (const order of orders) {
			expect(order).toMatchObject({
				paymentMethod: "mobile_money",
				paymentStatus: "unpaid",
				market: "market-cm",
			});
			expect(order.amounts.buyerProtectionFee).toBeGreaterThan(0);
			expect(order.amounts.currency).toBe("XAF");
		}
		expect(orders.map((o) => o.amounts.subtotal)).toEqual([25_000, 15_000]);
		expect(res.orders.map((o) => [o.paymentMethod, o.total])).toEqual(
			orders.map((o) => ["mobile_money", o.amounts.total]),
		);
		expect(rows(payload, "payment-intents")).toHaveLength(0);
	});
});

describe("flag off", () => {
	it("keeps placing the single-shop order through the same entry point", async () => {
		const payload = world({ multiShop: false });
		await fill(payload, buyer, [ALL[0]]);
		const view = await quoteCheckoutResponse(payload, buyer, draft(), opts());
		seq += 1;
		const input = {
			...draft(),
			quoteHash: (view as { quoteHash: string }).quoteHash,
			termsAccepted: true,
			idempotencyKey: `idem-${seq}`,
		};
		const viaEntry = await placeCheckoutResponse(payload, buyer, input, opts());
		expect(viaEntry).toMatchObject({
			orderId: expect.any(String),
			amounts: { total: 27_000 },
		});
		expect(viaEntry).not.toHaveProperty("checkoutGroup");
		expect(rows(payload, "orders")[0].checkoutGroup).toBeUndefined();
	});
});
