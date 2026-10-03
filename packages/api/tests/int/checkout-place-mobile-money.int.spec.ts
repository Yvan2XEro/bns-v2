// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendSms } = vi.hoisted(() => ({ sendSms: vi.fn() }));
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));

const { triggerNotificationEvent, hasPushCredential } = vi.hoisted(() => ({
	triggerNotificationEvent: vi.fn(async () => undefined),
	hasPushCredential: vi.fn(async () => true),
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent,
	hasPushCredential,
}));

const { queueSearchEvent } = vi.hoisted(() => ({
	queueSearchEvent: vi.fn(async () => undefined),
}));
vi.mock("../../src/hooks/searchEvents", () => ({ queueSearchEvent }));

import { FakeMarketplaceProvider } from "../../src/lib/payments/fakeMarketplace";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import type { Order } from "../../src/payload-types";
import {
	type CheckoutPlaceInput,
	placeOrder,
	quoteCheckout,
} from "../../src/services/checkout";
import { createCheckoutIntent } from "../../src/services/checkoutPayment";
import { registerOrderChatHandlers } from "../../src/services/orders/chat";
import { __resetOrderEventHandlers } from "../../src/services/orders/events";
import { registerOrderNotificationHandlers } from "../../src/services/orders/notifications";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const BUYER = { id: "u-buyer" };
const BUYER_PHONE = "+237670000001";
const PEPPER = "test-pepper";

function isOrder(value: unknown): value is Order {
	return typeof value === "object" && value !== null && "orderNumber" in value;
}
function orderAt(payload: FakePayload, index = 0): Order {
	const raw = payload.store.orders[index];
	if (!isOrder(raw))
		throw new Error(`test fixture: no order at index ${index}`);
	return raw;
}

const GATES = ["G1", "G2", "G3", "G4", "G5", "G6"].map((gate) => ({
	gate,
	clearedAt: "2026-09-30T00:00:00.000Z",
	clearedBy: "admin",
	evidence: `ev-${gate}`,
	note: null,
}));

/** Mirrors `checkout-payment.int.spec.ts`'s `payments()`: the flag open,
 * the launch market enabled, every gate cleared. */
function openPayments(overrides: Record<string, unknown> = {}) {
	return {
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
		...overrides,
	};
}

type Overrides = {
	shop?: Record<string, unknown>;
	variant?: Record<string, unknown>;
	payments?: Record<string, unknown> | null;
	connectedAccounts?: Record<string, unknown>[];
	payoutAccounts?: Record<string, unknown>[];
};

/** One shop (level 2, so protected payment is capability-eligible), one
 * product/listing/variant at 10 000 XAF, one buyer with a verified phone and
 * a one-line active cart — the same baseline `checkout-place.int.spec.ts`
 * uses for `placeOrder`, extended with the P5 payment-eligibility
 * collections `checkout-payment.int.spec.ts`'s `seed()` fixtures. */
function world(overrides: Overrides = {}) {
	return fakePayload(
		{
			users: [
				{
					id: "u-buyer",
					name: "Buyer",
					phone: BUYER_PHONE,
					phoneVerifiedAt: NOW.toISOString(),
					suspendedAt: null,
					suspendedUntil: null,
				},
				{ id: "u-owner", name: "Owner" },
			],
			shops: [
				{
					id: "s-1",
					name: "Chez Awa",
					handle: "chez-awa",
					owner: "u-owner",
					status: "active",
					level: 2,
					levelExpiresAt: null,
					ordersRestrictedAt: null,
					location: { city: "douala", countryCode: "CM" },
					contact: { phone: "+237690000000" },
					orderSettings: {
						codEnabled: true,
						sellerDeliveryEnabled: true,
						deliveryFee: null,
						deliveryEtaText: "24-48h",
						pickupEnabled: false,
						pickupPoint: undefined,
						salesTermsExtra: null,
					},
					...overrides.shop,
				},
			],
			products: [
				{
					id: "p-1",
					shop: "s-1",
					title: "AirPods",
					status: "active",
					delivery: { codAllowed: true },
					returnPolicy: "30 jours",
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
					category: "cat-1",
				},
			],
			"product-variants": [
				{
					id: "v-1",
					product: "p-1",
					shop: "s-1",
					sku: "AP-1",
					price: 10_000,
					trackInventory: true,
					stockOnHand: 5,
					stockReserved: 0,
					archivedAt: null,
					...overrides.variant,
				},
			],
			categories: [{ id: "cat-1", name: "Audio" }],
			"shop-members": [
				{
					id: "sm-1",
					shop: "s-1",
					user: "u-owner",
					status: "active",
					role: "owner",
				},
			],
			carts: [
				{
					id: "c-1",
					user: "u-buyer",
					status: "active",
					items: [
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
					],
				},
			],
			orders: [],
			"order-items": [],
			"order-events": [],
			"stock-movements": [],
			sequences: [],
			"buyer-phone-scores": [],
			"connected-accounts":
				overrides.connectedAccounts ??
				[
					{
						id: "ca-1",
						shop: "s-1",
						provider: "notchpay",
						providerAccountId: "acct_seed",
						status: "active",
						chargesEnabled: true,
						payoutsEnabled: true,
					},
				],
			"payout-accounts": overrides.payoutAccounts ?? [
				{ id: "pa-1", shop: "s-1", status: "active", method: "mtn_momo" },
			],
			"payout-holds": [],
		},
		{
			uniques: {
				carts: [["user", "status"]],
				"buyer-phone-scores": [["phoneHash"]],
				orders: [["buyer", "idempotencyKey"]],
				"payment-intents": [["idempotencyKey"]],
			},
			globals: {
				"app-settings": {
					orders: {
						enabled: true,
						launchCities: [
							{ key: "douala", deliveryFee: 2000 },
							{ key: "yaounde", deliveryFee: 3500 },
						],
						termsVersion: "2026-09",
						pilotShopIds: [],
					},
					company: {
						legalName: "BuyNSellem SARL",
						supportEmail: "support@buynsellem.com",
						supportPhone: "+237600000000",
					},
					...(overrides.payments === null
						? {}
						: { payments: overrides.payments ?? openPayments() }),
				},
			},
			secret: "test-payload-secret",
		},
	);
}

const baseAddress = (patch: Record<string, unknown> = {}) => ({
	recipientName: "Jean Mballa",
	phone: BUYER_PHONE,
	city: "douala",
	district: "douala.akwa",
	landmark: "Pres de la pharmacie du carrefour",
	instructions: "Appeler avant livraison",
	...patch,
});

let idempotencySeq = 0;
function freshIdempotencyKey(): string {
	idempotencySeq += 1;
	return `mm-idem-${idempotencySeq}`;
}

const baseQuoteInput = (patch: Record<string, unknown> = {}) => ({
	address: baseAddress(),
	deliveryOptionId: "seller_delivery:douala",
	paymentMethod: "mobile_money",
	locale: "fr",
	...patch,
});

/** Quotes for real, exactly like `checkout-place.int.spec.ts`'s
 * `quotedInput`, so the hash submitted to `placeOrder` is genuine. */
async function quotedInput(
	payload: FakePayload,
	buyer: { id: string },
	patch: Record<string, unknown> = {},
): Promise<CheckoutPlaceInput> {
	const quote = await quoteCheckout(payload, buyer, baseQuoteInput(patch), {
		now: NOW,
		store: new MemoryCounterStore(),
	});
	return {
		...baseQuoteInput(patch),
		quoteHash: quote.quoteHash,
		termsAccepted: true,
		idempotencyKey: freshIdempotencyKey(),
	};
}

/** For the refusal tests: `placeOrder` re-runs the same check `quoteCheckout`
 * would, and refuses before the quote hash is ever compared — so no genuine
 * quote is needed to prove the refusal. */
function dummyInput(patch: Record<string, unknown> = {}): CheckoutPlaceInput {
	return {
		...baseQuoteInput(patch),
		quoteHash: "",
		termsAccepted: true,
		idempotencyKey: freshIdempotencyKey(),
	};
}

beforeEach(() => {
	process.env.ORDER_PHONE_PEPPER = PEPPER;
	sendSms.mockClear();
	triggerNotificationEvent.mockClear();
	hasPushCredential.mockClear();
	queueSearchEvent.mockClear();
	__resetOrderEventHandlers();
	registerOrderChatHandlers();
	registerOrderNotificationHandlers();
	vi.stubEnv("PROTECTED_PAYMENT_ALLOWED", "true");
});
afterEach(() => {
	process.env.ORDER_PHONE_PEPPER = undefined;
	vi.unstubAllEnvs();
});

async function place(payload: FakePayload, input: CheckoutPlaceInput) {
	return placeOrder(payload, BUYER, input, {
		now: NOW,
		store: new MemoryCounterStore(),
	});
}

describe("placeOrder: mobile money behind the flag", () => {
	it("refuses with checkout.methodUnavailable when the flag is closed, and places no order", async () => {
		const payload = world({ payments: null });

		await expect(place(payload, dummyInput())).rejects.toMatchObject({
			code: "checkout.methodUnavailable",
			status: 409,
		});
		expect(payload.store.orders).toHaveLength(0);
	});

	it("refuses with checkout.methodUnavailable when PROTECTED_PAYMENT_ALLOWED is withdrawn", async () => {
		vi.stubEnv("PROTECTED_PAYMENT_ALLOWED", "");
		const payload = world();

		await expect(place(payload, dummyInput())).rejects.toMatchObject({
			code: "checkout.methodUnavailable",
			status: 409,
		});
		expect(payload.store.orders).toHaveLength(0);
	});

	it("refuses with payment.shopNotEligible for a shop with no connected account, and places no order", async () => {
		const payload = world({ connectedAccounts: [] });

		await expect(place(payload, dummyInput())).rejects.toMatchObject({
			code: "payment.shopNotEligible",
			status: 403,
		});
		expect(payload.store.orders).toHaveLength(0);
	});

	it("places the order in the exact payable shape, then a real intent creation succeeds on it — the full seam", async () => {
		const payload = world();
		const input = await quotedInput(payload, BUYER);

		const result = await place(payload, input);
		// A new buyer (no phone score yet) gets `sms_code`, not `none`: the
		// order stays `placed`, which is what the payable rule requires —
		// `confirmed` is not in its allowed set.
		expect(result.confirmationRequired).toBe("sms_code");

		const order = orderAt(payload);
		expect({
			status: order.status,
			paymentMethod: order.paymentMethod,
			paymentStatus: order.paymentStatus,
		}).toEqual({
			status: "placed",
			paymentMethod: "mobile_money",
			paymentStatus: "unpaid",
		});

		const fake = new FakeMarketplaceProvider({ now: () => NOW });
		fake.seedAccount({ accountId: "acct_seed" });
		const intent = await createCheckoutIntent(
			{ payload },
			order,
			{
				id: "u-buyer",
				role: "user",
				name: "Buyer",
				email: "u-buyer@test.cm",
				suspendedAt: null,
				suspendedUntil: null,
			},
			{ channel: "cm.mtn", phone: BUYER_PHONE, idempotencyKey: "intent-1" },
			{ provider: fake, now: NOW, serverUrl: "https://api.test" },
		);
		expect(intent.status).toBe("pending");

		const settled = await payload.findByID({
			collection: "orders",
			id: order.id,
		});
		expect(settled.paymentStatus).toBe("awaiting_payment");
	});
});

describe("placeOrder: COD is unchanged by the mobile-money path", () => {
	it("still places a cod order with cod's own payment fields, flag closed or not", async () => {
		const payload = world({ payments: null, connectedAccounts: [] });
		const input = await quotedInput(payload, BUYER, { paymentMethod: "cod" });

		const result = await place(payload, input);
		expect(result.confirmationRequired).toBe("sms_code");

		const order = orderAt(payload);
		expect({
			status: order.status,
			paymentMethod: order.paymentMethod,
			paymentStatus: order.paymentStatus,
		}).toEqual({
			status: "placed",
			paymentMethod: "cod",
			paymentStatus: "cod_pending",
		});
	});
});

describe("quoteCheckout/placeOrder: the protected quote is priced server-side (B-1)", () => {
	it("prices the fee and the real total under mobile_money; the cod quote of the same cart stays fee-less", async () => {
		const payload = world();

		const codQuote = await quoteCheckout(
			payload,
			BUYER,
			baseQuoteInput({ paymentMethod: "cod" }),
			{ now: NOW, store: new MemoryCounterStore() },
		);
		expect(codQuote.summary.paymentMethod).toBe("cod");
		expect(codQuote.summary.amounts).toEqual({
			subtotal: 10_000,
			deliveryFee: 2_000,
			discount: 0,
			buyerProtectionFee: 0,
			total: 12_000,
			currency: "XAF",
		});

		// 10 000 goods + 2 000 delivery = 12 000; 8 % commission (the
		// `openPayments()`/world() default) = 800; 3 % buyer-protection fee
		// of 12 000 = 360 — the exact `splitAmounts` result, not a client
		// literal.
		const mobileMoneyQuote = await quoteCheckout(
			payload,
			BUYER,
			baseQuoteInput({ paymentMethod: "mobile_money" }),
			{ now: NOW, store: new MemoryCounterStore() },
		);
		expect(mobileMoneyQuote.summary.paymentMethod).toBe("mobile_money");
		expect(mobileMoneyQuote.summary.amounts).toEqual({
			subtotal: 10_000,
			deliveryFee: 2_000,
			discount: 0,
			buyerProtectionFee: 360,
			total: 12_360,
			currency: "XAF",
		});

		const order = await place(
			payload,
			await quotedInput(payload, BUYER, { paymentMethod: "mobile_money" }),
		);
		const placed = orderAt(payload);
		expect(placed.amounts).toEqual({
			subtotal: 10_000,
			deliveryFee: 2_000,
			discount: 0,
			buyerProtectionFee: 360,
			total: 12_360,
			currency: "XAF",
		});
		expect(order.confirmationRequired).toBe("sms_code");
	});

	it("binds the quote hash to the method: a cod quote can never place a mobile_money order", async () => {
		const payload = world();
		const codQuote = await quoteCheckout(
			payload,
			BUYER,
			baseQuoteInput({ paymentMethod: "cod" }),
			{ now: NOW, store: new MemoryCounterStore() },
		);

		const input: CheckoutPlaceInput = {
			...baseQuoteInput({ paymentMethod: "mobile_money" }),
			quoteHash: codQuote.quoteHash,
			termsAccepted: true,
			idempotencyKey: freshIdempotencyKey(),
		};

		await expect(place(payload, input)).rejects.toMatchObject({
			code: "checkout.quoteChanged",
			status: 409,
		});
		expect(payload.store.orders).toHaveLength(0);
	});
});
