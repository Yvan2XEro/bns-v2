// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { MemoryCounterStore } from "../../src/lib/rateLimit";
import {
	type CheckoutPlaceInput,
	placeOrder,
	quoteCheckout,
} from "../../src/services/checkout";
import { registerOrderChatHandlers } from "../../src/services/orders/chat";
import { __resetOrderEventHandlers } from "../../src/services/orders/events";
import { registerOrderNotificationHandlers } from "../../src/services/orders/notifications";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-02T10:00:00.000Z");

beforeEach(() => {
	process.env.ORDER_PHONE_PEPPER = "test-pepper";
	sendSms.mockClear();
	__resetOrderEventHandlers();
	registerOrderChatHandlers();
	registerOrderNotificationHandlers();
});

/** Two shops' worth of independence is never needed here, only two buyers or
 * two lines against one shop's one variant — `checkout-place.int.spec.ts`
 * owns every other scenario. */
function world(
	options: {
		buyers?: string[];
		stockOnHand?: number;
		secondVariant?: boolean;
	} = {},
) {
	const buyers = options.buyers ?? ["u-buyer"];
	const items = [
		{
			id: "i-1",
			listing: "l-1",
			product: "p-1",
			variant: "v-1",
			shop: "s-1",
			quantity: 1,
			priceAtAdd: 10_000,
			addedAt: NOW.toISOString(),
		},
	];
	if (options.secondVariant) {
		items.push({
			id: "i-2",
			listing: "l-2",
			product: "p-2",
			variant: "v-2",
			shop: "s-1",
			quantity: 1,
			priceAtAdd: 5_000,
			addedAt: NOW.toISOString(),
		});
	}

	const accountPhones = ["+237670000001", "+237670000002"];
	return fakePayload(
		{
			users: [
				...buyers.map((id, i) => ({
					id,
					name: id,
					phone: accountPhones[i],
					phoneVerifiedAt: NOW.toISOString(),
				})),
				{ id: "u-owner", name: "Owner" },
			],
			shops: [
				{
					id: "s-1",
					name: "Chez Awa",
					handle: "chez-awa",
					owner: "u-owner",
					status: "active",
					level: 1,
					location: { city: "douala" },
					contact: { phone: "+237690000000" },
					orderSettings: { codEnabled: true, sellerDeliveryEnabled: true },
				},
			],
			products: [
				{
					id: "p-1",
					shop: "s-1",
					title: "AirPods",
					status: "active",
					delivery: { codAllowed: true },
				},
				{
					id: "p-2",
					shop: "s-1",
					title: "Case",
					status: "active",
					delivery: { codAllowed: true },
				},
			],
			listings: [
				{
					id: "l-1",
					title: "AirPods Pro",
					status: "published",
					shop: "s-1",
					product: "p-1",
					condition: "new",
				},
				{
					id: "l-2",
					title: "AirPods Case",
					status: "published",
					shop: "s-1",
					product: "p-2",
					condition: "new",
				},
			],
			"product-variants": [
				{
					id: "v-1",
					product: "p-1",
					shop: "s-1",
					price: 10_000,
					trackInventory: true,
					stockOnHand: options.stockOnHand ?? 5,
					stockReserved: 0,
				},
				{
					id: "v-2",
					product: "p-2",
					shop: "s-1",
					price: 5_000,
					trackInventory: true,
					stockOnHand: 5,
					stockReserved: 0,
				},
			],
			"shop-members": [
				{
					id: "sm-1",
					shop: "s-1",
					user: "u-owner",
					status: "active",
					role: "owner",
				},
			],
			carts: buyers.map((id, i) => ({
				id: `c-${i + 1}`,
				user: id,
				status: "active",
				items,
			})),
			orders: [],
			"order-items": [],
			"order-events": [],
			"stock-movements": [],
			sequences: [],
			"buyer-phone-scores": [],
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
						launchCities: [{ key: "douala", deliveryFee: 2000 }],
						termsVersion: "2026-09",
						pilotShopIds: [],
					},
					company: { legalName: "BuyNSellem SARL" },
				},
			},
			secret: "test-secret",
		},
	);
}

const baseAddress = (phone: string) => ({
	recipientName: "Jean Mballa",
	phone,
	city: "douala",
	district: "douala.akwa",
	landmark: "Pres de la pharmacie du carrefour",
	instructions: "",
});

const baseQuoteInput = (phone: string) => ({
	address: baseAddress(phone),
	deliveryOptionId: "seller_delivery:douala",
	paymentMethod: "cod",
	locale: "fr" as const,
});

async function quotedInput(
	payload: FakePayload,
	buyer: { id: string },
	phone: string,
	idempotencyKey: string,
): Promise<CheckoutPlaceInput> {
	const quote = await quoteCheckout(payload, buyer, baseQuoteInput(phone), {
		now: NOW,
		store: new MemoryCounterStore(),
	});
	return {
		...baseQuoteInput(phone),
		quoteHash: quote.quoteHash,
		termsAccepted: true,
		idempotencyKey,
	};
}

describe("placeOrder: writes nothing when a reservation fails mid-way", () => {
	it("rolls back the order, its items and the first reservation when the second one fails", async () => {
		const payload = world({ secondVariant: true });
		const buyer = { id: "u-buyer" };
		const input = await quotedInput(payload, buyer, "+237670000000", "idem-1");

		// `failWhen` on the second reserve: simulate a concurrent buyer taking
		// the last unit of the second line's variant right before this
		// transaction's own reservation attempt — stock still looked fine at
		// quote time, so this is a mid-transaction failure, not a precondition
		// one.
		let productVariantUpdateOneCalls = 0;
		payload.failWhen = (method, args) => {
			if (method === "db.updateOne" && args.collection === "product-variants") {
				productVariantUpdateOneCalls += 1;
				if (productVariantUpdateOneCalls === 2) {
					const row = payload.store["product-variants"].find(
						(v) => v.id === "v-2",
					);
					if (row) row.stockReserved = row.stockOnHand;
				}
			}
			return false;
		};

		const error = await placeOrder(payload, buyer, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		}).catch((e) => e);

		expect(error).toMatchObject({ code: "cart.outOfStock", status: 409 });
		expect(error.details.line.variantId).toBe("v-2");

		// The rollback journal proves it, not just an absence of an order:
		expect(payload.store.orders).toHaveLength(0);
		expect(payload.store["order-items"]).toHaveLength(0);
		expect(payload.store["stock-movements"]).toHaveLength(0);
		const variantOne = payload.store["product-variants"].find(
			(v) => v.id === "v-1",
		);
		expect(variantOne?.stockReserved).toBe(0);
		expect(payload.store.carts[0].status).toBe("active");
	});
});

describe("placeOrder: two buyers checking out the last unit produce one order", () => {
	it("one placement succeeds, the other is refused, and exactly one unit is reserved", async () => {
		const payload = world({
			buyers: ["u-buyer-a", "u-buyer-b"],
			stockOnHand: 1,
		});
		const buyerA = { id: "u-buyer-a" };
		const buyerB = { id: "u-buyer-b" };
		const [inputA, inputB] = await Promise.all([
			quotedInput(payload, buyerA, "+237670000000", "idem-a"),
			quotedInput(payload, buyerB, "+237670000011", "idem-b"),
		]);

		const [resultA, resultB] = await Promise.allSettled([
			placeOrder(payload, buyerA, inputA, {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
			placeOrder(payload, buyerB, inputB, {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		]);

		const outcomes = [resultA, resultB];
		const fulfilled = outcomes.filter((r) => r.status === "fulfilled");
		const rejected = outcomes.filter((r) => r.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
			code: "cart.outOfStock",
			status: 409,
		});

		expect(payload.store.orders).toHaveLength(1);
		const variant = payload.store["product-variants"].find(
			(v) => v.id === "v-1",
		);
		expect(variant?.stockReserved).toBe(1);
	});
});

describe("placeOrder: idempotency", () => {
	it("a replayed idempotencyKey returns the same order and reserves once", async () => {
		const payload = world();
		const buyer = { id: "u-buyer" };
		const input = await quotedInput(
			payload,
			buyer,
			"+237670000000",
			"idem-replay",
		);

		const first = await placeOrder(payload, buyer, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});
		const second = await placeOrder(payload, buyer, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(second.orderId).toBe(first.orderId);
		expect(payload.store.orders).toHaveLength(1);
		const variant = payload.store["product-variants"].find(
			(v) => v.id === "v-1",
		);
		expect(variant?.stockReserved).toBe(1);
	});

	it("two concurrent requests with the same idempotencyKey produce one order", async () => {
		const payload = world();
		const buyer = { id: "u-buyer" };
		const input = await quotedInput(
			payload,
			buyer,
			"+237670000000",
			"idem-concurrent",
		);

		const [a, b] = await Promise.all([
			placeOrder(payload, buyer, input, {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
			placeOrder(payload, buyer, input, {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		]);

		expect(a.orderId).toBe(b.orderId);
		expect(payload.store.orders).toHaveLength(1);
		const variant = payload.store["product-variants"].find(
			(v) => v.id === "v-1",
		);
		expect(variant?.stockReserved).toBe(1);
	});
});
