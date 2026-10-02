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

import { hashDeliveryPhone } from "../../src/lib/phoneHash";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import type { Cart, Order, OrderItem } from "../../src/payload-types";
import {
	type CheckoutPlaceInput,
	placeOrder,
	quoteCheckout,
} from "../../src/services/checkout";
import { registerOrderChatHandlers } from "../../src/services/orders/chat";
import { __resetOrderEventHandlers } from "../../src/services/orders/events";
import { registerOrderNotificationHandlers } from "../../src/services/orders/notifications";
import { normalizePhoneNumber } from "../../src/services/phoneVerification";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

const PEPPER = "test-pepper";
const NOW = new Date("2026-10-02T10:00:00.000Z");
const BUYER = { id: "u-buyer" };
const BUYER_PHONE = "+237670000001";

/** `payload.store` is typed as plain `Record<string, unknown>[]`, since the
 * fake has no collection-specific shape of its own; these narrow a row back
 * to its real type the same way `order-chat.int.spec.ts`'s `isOrder` does. */
function isOrder(value: unknown): value is Order {
	return typeof value === "object" && value !== null && "orderNumber" in value;
}
function orderAt(payload: FakePayload, index = 0): Order {
	const raw = payload.store.orders[index];
	if (!isOrder(raw))
		throw new Error(`test fixture: no order at index ${index}`);
	return raw;
}

function isOrderItem(value: unknown): value is OrderItem {
	return typeof value === "object" && value !== null && "unitPrice" in value;
}
function orderItemAt(payload: FakePayload, index = 0): OrderItem {
	const raw = payload.store["order-items"][index];
	if (!isOrderItem(raw)) {
		throw new Error(`test fixture: no order-item at index ${index}`);
	}
	return raw;
}

/** `order.contract.snapshot` is a `json` field — no named shape of its own
 * on the Payload side — so this narrows just the part the test reads. */
function isContractSnapshotLike(
	value: unknown,
): value is { amounts: { total: number } } {
	return typeof value === "object" && value !== null && "amounts" in value;
}

function isCart(value: unknown): value is Cart {
	return typeof value === "object" && value !== null && "items" in value;
}
function cartAt(payload: FakePayload, index = 0): Cart {
	const raw = payload.store.carts[index];
	if (!isCart(raw)) throw new Error(`test fixture: no cart at index ${index}`);
	return raw;
}

const hashOf = (e164: string) =>
	hashDeliveryPhone(PEPPER, normalizePhoneNumber(e164));

beforeEach(() => {
	process.env.ORDER_PHONE_PEPPER = PEPPER;
	sendSms.mockClear();
	triggerNotificationEvent.mockClear();
	hasPushCredential.mockClear();
	queueSearchEvent.mockClear();
	__resetOrderEventHandlers();
	registerOrderChatHandlers();
	registerOrderNotificationHandlers();
});
afterEach(() => {
	process.env.ORDER_PHONE_PEPPER = undefined;
});

type Overrides = {
	ordersEnabled?: boolean;
	pilotShopIds?: string[];
	buyer?: Record<string, unknown>;
	shop?: Record<string, unknown>;
	product?: Record<string, unknown>;
	listing?: Record<string, unknown>;
	variant?: Record<string, unknown>;
	cart?: Record<string, unknown> | null;
	orders?: Record<string, unknown>[];
	buyerPhoneScores?: Record<string, unknown>[];
	extraUsers?: Record<string, unknown>[];
};

/** One shop, one product/listing/variant at 10 000 XAF (stock 5), one buyer
 * with a verified +237 phone and a one-line active cart — the same baseline
 * `checkout-quote.int.spec.ts` uses, so `placeOrder`'s precondition tests
 * mirror `quoteCheckout`'s exactly. */
function world(overrides: Overrides = {}) {
	const cart =
		overrides.cart === null
			? []
			: [
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
						...overrides.cart,
					},
				];

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
					...overrides.buyer,
				},
				{ id: "u-owner", name: "Owner" },
				...(overrides.extraUsers ?? []),
			],
			shops: [
				{
					id: "s-1",
					name: "Chez Awa",
					handle: "chez-awa",
					owner: "u-owner",
					status: "active",
					level: 1,
					levelExpiresAt: null,
					ordersRestrictedAt: null,
					location: { city: "douala" },
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
					condition: "new",
					category: "cat-1",
					...overrides.listing,
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
			carts: cart,
			orders: overrides.orders ?? [],
			"order-items": [],
			"order-events": [],
			"stock-movements": [],
			sequences: [],
			"buyer-phone-scores": overrides.buyerPhoneScores ?? [],
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
						enabled: overrides.ordersEnabled ?? true,
						launchCities: [
							{ key: "douala", deliveryFee: 2000 },
							{ key: "yaounde", deliveryFee: 3500 },
						],
						termsVersion: "2026-09",
						pilotShopIds: overrides.pilotShopIds ?? [],
					},
					company: {
						legalName: "BuyNSellem SARL",
						supportEmail: "support@buynsellem.com",
						supportPhone: "+237600000000",
					},
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
	return `idem-${idempotencySeq}`;
}

const baseQuoteInput = (patch: Record<string, unknown> = {}) => ({
	address: baseAddress(),
	deliveryOptionId: "seller_delivery:douala",
	paymentMethod: "cod",
	locale: "fr",
	...patch,
});

/** Quotes for real (so the hash is genuine), then builds the `place` input
 * around it: the quote is never re-implemented, only reused, mirroring what
 * `placeOrder` itself does. */
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

function dummyInput(patch: Record<string, unknown> = {}): CheckoutPlaceInput {
	return {
		...baseQuoteInput(patch),
		quoteHash: "",
		termsAccepted: true,
		idempotencyKey: freshIdempotencyKey(),
	};
}

function trustedBuyerPhoneScore(phone = BUYER_PHONE) {
	return {
		phoneHash: hashOf(phone),
		ordersPlaced: 3,
		ordersDelivered: 3,
		cancelledAfterAccept: 0,
		blockedOverride: "none",
		refusals: [],
	};
}

describe("placeOrder: re-runs every quote check", () => {
	it("refuses with checkout.disabled when the flag is off", async () => {
		const payload = world({ ordersEnabled: false });
		await expect(
			placeOrder(payload, BUYER, dummyInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "checkout.disabled", status: 403 });
	});

	it("refuses with checkout.phoneNotVerified for an unverified phone", async () => {
		const payload = world({ buyer: { phoneVerifiedAt: null } });
		await expect(
			placeOrder(payload, BUYER, dummyInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "checkout.phoneNotVerified", status: 403 });
	});

	it("refuses with moderation.accountSuspended for a suspended buyer", async () => {
		const payload = world({
			buyer: { suspendedAt: NOW.toISOString(), suspendedUntil: null },
		});
		await expect(
			placeOrder(payload, BUYER, dummyInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({
			code: "moderation.accountSuspended",
			status: 403,
		});
	});

	it("refuses with cart.empty for an empty cart", async () => {
		const payload = world({ cart: null });
		await expect(
			placeOrder(payload, BUYER, dummyInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "cart.empty", status: 400 });
	});

	it("refuses with cart.outOfStock naming the offending line", async () => {
		const payload = world({ variant: { stockOnHand: 0 } });
		const error = await placeOrder(payload, BUYER, dummyInput(), {
			now: NOW,
			store: new MemoryCounterStore(),
		}).catch((e) => e);
		expect(error).toMatchObject({ code: "cart.outOfStock", status: 409 });
		expect(error.details.line.variantId).toBe("v-1");
	});

	it("refuses with order.shopUnavailable for a non-active shop", async () => {
		const payload = world({ shop: { status: "suspended" } });
		await expect(
			placeOrder(payload, BUYER, dummyInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "order.shopUnavailable", status: 409 });
	});

	it("refuses with order.codUnavailable when codEnabled is false", async () => {
		const payload = world({ shop: { orderSettings: { codEnabled: false } } });
		await expect(
			placeOrder(payload, BUYER, dummyInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "order.codUnavailable", status: 409 });
	});

	it("refuses with order.codUnavailable for a non-pilot shop", async () => {
		const payload = world({ pilotShopIds: ["s-2"] });
		await expect(
			placeOrder(payload, BUYER, dummyInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "order.codUnavailable", status: 409 });
	});
});

describe("placeOrder: the quote is never trusted", () => {
	it("refuses a price change with checkout.quoteChanged and returns the fresh quote", async () => {
		const payload = world();
		const input = await quotedInput(payload, BUYER);
		payload.store["product-variants"][0].price = 12_000;

		const error = await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		}).catch((e) => e);

		expect(error).toMatchObject({ code: "checkout.quoteChanged", status: 409 });
		expect(error.details.quote.summary.total).toBe(14_000);
		expect(payload.store.orders).toHaveLength(0);
	});

	it("refuses a delivery fee change with checkout.quoteChanged and returns the fresh quote", async () => {
		const payload = world();
		const input = await quotedInput(payload, BUYER);
		const settings = payload.globals["app-settings"] as {
			orders: { launchCities: Array<{ key: string; deliveryFee: number }> };
		};
		settings.orders.launchCities[0].deliveryFee = 3_000;

		const error = await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		}).catch((e) => e);

		expect(error).toMatchObject({ code: "checkout.quoteChanged", status: 409 });
		expect(error.details.quote.summary.deliveryFee).toBe(3_000);
		expect(payload.store.orders).toHaveLength(0);
	});

	it("refuses a cart quantity change with checkout.quoteChanged and returns the fresh quote", async () => {
		const payload = world();
		const input = await quotedInput(payload, BUYER);
		const cartItem = cartAt(payload).items?.[0];
		if (!cartItem) throw new Error("test fixture: cart has no first item");
		cartItem.quantity = 2;

		const error = await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		}).catch((e) => e);

		expect(error).toMatchObject({ code: "checkout.quoteChanged", status: 409 });
		expect(error.details.quote.summary.items[0].quantity).toBe(2);
		expect(payload.store.orders).toHaveLength(0);
	});

	it("refuses a missing termsAccepted with checkout.termsNotAccepted", async () => {
		const payload = world();
		const input = await quotedInput(payload, BUYER);
		input.termsAccepted = false;

		await expect(
			placeOrder(payload, BUYER, input, {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "checkout.termsNotAccepted", status: 400 });
		expect(payload.store.orders).toHaveLength(0);
	});
});

describe("placeOrder: order numbering", () => {
	it("numbers the order BNS-YYMM-NNNNNN, written outside the transaction", async () => {
		const payload = world();
		const input = await quotedInput(payload, BUYER);

		const result = await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(result.orderNumber).toMatch(/^BNS-2610-\d{6}$/);
		const sequenceWrite = payload.writes.find(
			(w) => w.collection === "sequences",
		);
		const orderWrite = payload.writes.find(
			(w) => w.collection === "orders" && w.op === "create",
		);
		expect(sequenceWrite?.transactionID).toBeUndefined();
		expect(orderWrite?.transactionID).toBeDefined();
	});
});

describe("placeOrder: one transaction for every write", () => {
	it("creates the order, the items, the reservation, the event and the converted cart together", async () => {
		const payload = world();
		const input = await quotedInput(payload, BUYER);
		const before = payload.writes.length;

		const result = await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		// `sequences` is deliberately outside the transaction (see the numbering
		// test above), and the conversation/message writes are the post-commit
		// chat handler's (see the "fires after commit" tests below) — neither
		// belongs to the placement transaction itself.
		const placementCollections = [
			"orders",
			"order-items",
			"stock-movements",
			"order-events",
			"carts",
		];
		const writes = payload.writes
			.slice(before)
			.filter((w) => placementCollections.includes(w.collection));
		const collections = new Set(writes.map((w) => w.collection));
		expect(collections.has("orders")).toBe(true);
		expect(collections.has("order-items")).toBe(true);
		expect(collections.has("stock-movements")).toBe(true);
		expect(collections.has("order-events")).toBe(true);
		expect(collections.has("carts")).toBe(true);

		const transactionIds = new Set(writes.map((w) => w.transactionID));
		expect(transactionIds.size).toBe(1);
		expect([...transactionIds][0]).toBeDefined();

		expect(payload.store.carts[0].status).toBe("converted");
		expect(payload.store.carts[0].convertedOrders).toEqual([result.orderId]);
		expect(payload.store["order-items"]).toHaveLength(1);
		expect(payload.store["stock-movements"]).toHaveLength(1);
	});
});

describe("placeOrder: the confirmation path", () => {
	it("a trusted buyer on their verified phone is confirmed immediately, with no confirmation SMS", async () => {
		const payload = world({ buyerPhoneScores: [trustedBuyerPhoneScore()] });
		const input = await quotedInput(payload, BUYER);

		const result = await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(result.status).toBe("confirmed");
		expect(result.confirmationRequired).toBe("none");
		const order = orderAt(payload);
		expect(order.confirmation?.method).toBe("verified_phone");
		expect(order.confirmation?.codeHash ?? null).toBeNull();
		// The receipt still fires — only the confirmation code is skipped.
		expect(sendSms).toHaveBeenCalledTimes(1);
	});

	it("a new buyer on their verified phone still gets an SMS code", async () => {
		const payload = world();
		const input = await quotedInput(payload, BUYER);

		const result = await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(result.status).toBe("placed");
		expect(result.confirmationRequired).toBe("sms_code");
		const order = orderAt(payload);
		expect(order.confirmation?.method).toBe("sms_code");
		expect(order.confirmation?.codeHash).toBeTruthy();
		expect(sendSms).toHaveBeenCalledTimes(2); // the receipt, then the code
	});

	it("a trusted buyer delivering to another phone still gets an SMS code", async () => {
		const payload = world({ buyerPhoneScores: [trustedBuyerPhoneScore()] });
		const otherPhone = "+237670000099";
		const input = await quotedInput(payload, BUYER, {
			address: baseAddress({ phone: otherPhone }),
		});

		const result = await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(result.status).toBe("placed");
		expect(result.confirmationRequired).toBe("sms_code");
		expect(orderAt(payload).confirmation?.method).toBe("sms_code");
	});

	it("a watch-tier buyer is placed with no code, and the shop is told to call", async () => {
		const payload = world({
			buyerPhoneScores: [
				{
					...trustedBuyerPhoneScore(),
					ordersDelivered: 0,
					refusals: [
						{ order: "o-1", reason: "refused", at: NOW.toISOString() },
						{ order: "o-2", reason: "refused", at: NOW.toISOString() },
					],
				},
			],
		});
		const input = await quotedInput(payload, BUYER);

		const result = await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(result.status).toBe("placed");
		expect(result.confirmationRequired).toBe("seller_call");
		expect(orderAt(payload).confirmation?.method).toBe("seller_call");
		expect(orderAt(payload).confirmation?.codeHash ?? null).toBeNull();
		expect(sendSms).toHaveBeenCalledTimes(1); // the receipt only, no code
		expect(triggerNotificationEvent).toHaveBeenCalledWith(
			expect.objectContaining({ event: "order-confirmation-needed" }),
		);
	});
});

describe("placeOrder: deadlines", () => {
	it("sets confirmBy at placedAt + 24h and acceptBy at placedAt + 48h", async () => {
		const payload = world();
		const input = await quotedInput(payload, BUYER);

		const result = await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(result.deadlines.confirmBy).toBe("2026-10-03T10:00:00.000Z");
		expect(result.deadlines.acceptBy).toBe("2026-10-04T10:00:00.000Z");
	});

	it("acceptBy is fixed at placement and does not move for an auto-confirmed order", async () => {
		const payload = world({ buyerPhoneScores: [trustedBuyerPhoneScore()] });
		const input = await quotedInput(payload, BUYER);

		const result = await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(result.status).toBe("confirmed");
		// 48h from `timestamps.placedAt`, the same value the non-auto-confirmed
		// case above gets — not from `confirmation.confirmedAt`, which this
		// order also sets at the very same instant.
		expect(result.deadlines.acceptBy).toBe("2026-10-04T10:00:00.000Z");
		expect(orderAt(payload).timestamps?.placedAt).toBe(NOW.toISOString());
	});
});

describe("placeOrder: the contract snapshot", () => {
	it("stores the snapshot, its hash and the locale as shown to the buyer", async () => {
		const payload = world();
		const quote = await quoteCheckout(payload, BUYER, baseQuoteInput(), {
			now: NOW,
			store: new MemoryCounterStore(),
		});
		const input: CheckoutPlaceInput = {
			...baseQuoteInput(),
			quoteHash: quote.quoteHash,
			termsAccepted: true,
			idempotencyKey: freshIdempotencyKey(),
		};

		await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		const order = orderAt(payload);
		expect(order.contract?.termsVersion).toBe("2026-09");
		expect(order.contract?.locale).toBe("fr");
		const snapshot = order.contract?.snapshot;
		if (!isContractSnapshotLike(snapshot)) {
			throw new Error("test fixture: order has no contract snapshot");
		}
		expect(snapshot.amounts.total).toBe(quote.preContract.amounts.total);
		expect(order.contract?.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe("placeOrder: commission", () => {
	it("computes each item's commission at placement, without accruing it", async () => {
		const payload = world();
		const input = await quotedInput(payload, BUYER);

		await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		const item = orderItemAt(payload);
		expect(item.commissionRateBps).toBe(800);
		expect(item.commissionAmount).toBe(800); // 800 bps of 10 000
		expect(payload.store["commission-lines"] ?? []).toHaveLength(0);
		expect(orderAt(payload).commission?.line ?? null).toBeNull();
	});
});

describe("placeOrder: stock snapshot", () => {
	it("copies stockTracked onto the order item at placement", async () => {
		const payload = world();
		const input = await quotedInput(payload, BUYER);

		await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(orderItemAt(payload).stockTracked).toBe(true);
	});

	it("an untracked variant's item carries stockTracked: false and no reservation", async () => {
		const payload = world({ variant: { trackInventory: false } });
		const input = await quotedInput(payload, BUYER);

		await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(orderItemAt(payload).stockTracked).toBe(false);
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});
});

describe("placeOrder: everything external fires after commit, not during", () => {
	it("queues the receipt, the conversation, the notification and the search event after commit", async () => {
		const payload = world({ variant: { stockOnHand: 1 } });
		const input = await quotedInput(payload, BUYER);

		await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(sendSms).toHaveBeenCalledTimes(2); // the receipt, then the code
		expect(payload.store.conversations).toHaveLength(1);
		expect(triggerNotificationEvent).toHaveBeenCalledWith(
			expect.objectContaining({ event: "order-placed" }),
		);
		expect(queueSearchEvent).toHaveBeenCalledWith(
			expect.anything(),
			"listing.updated",
			"l-1",
		);
	});

	it("none of them fire when the transaction rolls back", async () => {
		const payload = world();
		const input = await quotedInput(payload, BUYER);
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "order-events";

		await expect(
			placeOrder(payload, BUYER, input, {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toThrow();

		expect(payload.store.orders).toHaveLength(0);
		expect(sendSms).not.toHaveBeenCalled();
		expect(triggerNotificationEvent).not.toHaveBeenCalled();
		expect(queueSearchEvent).not.toHaveBeenCalled();
	});

	it("publishes listing.updated only for a variant whose availability reached zero", async () => {
		const payload = world({ variant: { stockOnHand: 5 } });
		const input = await quotedInput(payload, BUYER);

		await placeOrder(payload, BUYER, input, {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(queueSearchEvent).not.toHaveBeenCalled();
	});
});
