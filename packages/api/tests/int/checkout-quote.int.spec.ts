// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashDeliveryPhone } from "../../src/lib/phoneHash";
import { quoteHash } from "../../src/lib/quoteHash";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import {
	type CheckoutQuoteInput,
	QUOTE_RATE_LIMITS,
	quoteCheckout,
} from "../../src/services/checkout";
import { normalizePhoneNumber } from "../../src/services/phoneVerification";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

const PEPPER = "test-pepper";
const NOW = new Date("2026-10-02T10:00:00.000Z");
const BUYER = { id: "u-buyer" };
const BUYER_PHONE = "+237670000001";

const hashOf = (e164: string) =>
	hashDeliveryPhone(PEPPER, normalizePhoneNumber(e164));

beforeEach(() => {
	process.env.ORDER_PHONE_PEPPER = PEPPER;
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

/**
 * One shop (`s-1`, Douala, level 1, COD on), one product/listing/variant at
 * 10 000 XAF, one buyer with a verified +237 phone and a one-line active
 * cart. Every precondition test below overrides exactly one field off this
 * baseline, so the eight checks stay independent of each other and of
 * execution order — same discipline as `cart-service.int.spec.ts`'s `world`.
 */
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
			carts: cart,
			orders: overrides.orders ?? [],
			"buyer-phone-scores": overrides.buyerPhoneScores ?? [],
		},
		{
			uniques: {
				carts: [["user", "status"]],
				"buyer-phone-scores": [["phoneHash"]],
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

const baseInput = (
	patch: Partial<CheckoutQuoteInput> = {},
): CheckoutQuoteInput => ({
	address: baseAddress(),
	deliveryOptionId: "seller_delivery:douala",
	paymentMethod: "cod",
	locale: "fr",
	...patch,
});

async function codeOf(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
		return null;
	} catch (error) {
		return (error as { code?: unknown }).code;
	}
}

describe("quoteCheckout: the eight shared preconditions", () => {
	it("refuses with checkout.disabled when the flag is off", async () => {
		const payload = world({ ordersEnabled: false });
		await expect(
			quoteCheckout(payload, BUYER, baseInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "checkout.disabled", status: 403 });
	});

	it("refuses with checkout.phoneNotVerified for an unverified phone", async () => {
		const payload = world({ buyer: { phoneVerifiedAt: null } });
		await expect(
			quoteCheckout(payload, BUYER, baseInput(), {
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
			quoteCheckout(payload, BUYER, baseInput(), {
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
			quoteCheckout(payload, BUYER, baseInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "cart.empty", status: 400 });
	});

	it("refuses with cart.outOfStock naming the offending line", async () => {
		const payload = world({ variant: { stockOnHand: 0 } });
		const error = await quoteCheckout(payload, BUYER, baseInput(), {
			now: NOW,
			store: new MemoryCounterStore(),
		}).catch((e) => e);
		expect(error).toMatchObject({ code: "cart.outOfStock", status: 409 });
		expect(error.details.line.variantId).toBe("v-1");
	});

	it("refuses with order.shopUnavailable for a non-active shop", async () => {
		const payload = world({ shop: { status: "suspended" } });
		await expect(
			quoteCheckout(payload, BUYER, baseInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "order.shopUnavailable", status: 409 });
	});

	it("refuses with order.shopUnavailable for a restricted shop", async () => {
		const payload = world({ shop: { ordersRestrictedAt: NOW.toISOString() } });
		await expect(
			quoteCheckout(payload, BUYER, baseInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "order.shopUnavailable", status: 409 });
	});

	it("refuses with order.codUnavailable when codEnabled is false", async () => {
		const payload = world({ shop: { orderSettings: { codEnabled: false } } });
		await expect(
			quoteCheckout(payload, BUYER, baseInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "order.codUnavailable", status: 409 });
	});

	// `shopCapabilities` (Task 2, merged — not re-declared here) only reads
	// `shop.level` for an ACTIVE shop, and defaults anything that is not
	// exactly 2 or 3 to effective level 1: an active shop is never level 0 in
	// this model, so level 0's `codOrders: false` is reached only through
	// `status !== "active"`, already covered by the shop-unavailable cases
	// above. There is no behaviour left for this check to isolate on its own.

	it("refuses with order.codUnavailable for a non-pilot shop", async () => {
		const payload = world({ pilotShopIds: ["s-2"] });
		await expect(
			quoteCheckout(payload, BUYER, baseInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "order.codUnavailable", status: 409 });
	});
});

describe("quoteCheckout: address validation", () => {
	it("refuses a recipient name that is too short", async () => {
		const payload = world();
		const error = await quoteCheckout(
			payload,
			BUYER,
			baseInput({ address: baseAddress({ recipientName: "A" }) }),
			{ now: NOW, store: new MemoryCounterStore() },
		).catch((e) => e);
		expect(error).toMatchObject({
			code: "checkout.addressInvalid",
			status: 400,
		});
		expect(error.details.field).toBe("delivery.recipientName");
	});

	it("refuses a non-Cameroonian phone", async () => {
		const payload = world();
		const error = await quoteCheckout(
			payload,
			BUYER,
			baseInput({ address: baseAddress({ phone: "+33612345678" }) }),
			{ now: NOW, store: new MemoryCounterStore() },
		).catch((e) => e);
		expect(error.details.field).toBe("delivery.phone");
	});

	it("refuses a non-launch city", async () => {
		const payload = world();
		const error = await quoteCheckout(
			payload,
			BUYER,
			baseInput({
				address: baseAddress({ city: "kribi", district: "kribi.centre" }),
			}),
			{ now: NOW, store: new MemoryCounterStore() },
		).catch((e) => e);
		expect(error.details.field).toBe("delivery.city");
	});

	it("refuses a district belonging to the other city", async () => {
		const payload = world();
		const error = await quoteCheckout(
			payload,
			BUYER,
			baseInput({ address: baseAddress({ district: "yaounde.bastos" }) }),
			{ now: NOW, store: new MemoryCounterStore() },
		).catch((e) => e);
		expect(error.details.field).toBe("delivery.district");
	});

	it("refuses {city}.other without districtOther", async () => {
		const payload = world();
		const error = await quoteCheckout(
			payload,
			BUYER,
			baseInput({ address: baseAddress({ district: "douala.other" }) }),
			{ now: NOW, store: new MemoryCounterStore() },
		).catch((e) => e);
		expect(error.details.field).toBe("delivery.districtOther");
	});

	it("refuses a missing landmark on seller_delivery", async () => {
		const payload = world();
		const error = await quoteCheckout(
			payload,
			BUYER,
			baseInput({ address: baseAddress({ landmark: "" }) }),
			{ now: NOW, store: new MemoryCounterStore() },
		).catch((e) => e);
		expect(error.details.field).toBe("delivery.landmark");
	});

	it("refuses instructions over 300 characters", async () => {
		const payload = world();
		const error = await quoteCheckout(
			payload,
			BUYER,
			baseInput({ address: baseAddress({ instructions: "x".repeat(301) }) }),
			{ now: NOW, store: new MemoryCounterStore() },
		).catch((e) => e);
		expect(error.details.field).toBe("delivery.instructions");
	});
});

describe("quoteCheckout: city, method and caps", () => {
	it("refuses checkout.cityNotServed when the city differs from the shop's", async () => {
		const payload = world();
		await expect(
			quoteCheckout(
				payload,
				BUYER,
				baseInput({
					address: baseAddress({ city: "yaounde", district: "yaounde.bastos" }),
				}),
				{ now: NOW, store: new MemoryCounterStore() },
			),
		).rejects.toMatchObject({ code: "checkout.cityNotServed", status: 409 });
	});

	it("refuses checkout.methodUnavailable for a withdrawn option", async () => {
		const payload = world(); // pickup disabled on this shop
		await expect(
			quoteCheckout(
				payload,
				BUYER,
				baseInput({ deliveryOptionId: "pickup:s-1" }),
				{
					now: NOW,
				},
			),
		).rejects.toMatchObject({
			code: "checkout.methodUnavailable",
			status: 409,
		});
	});

	it("refuses order.codUnavailable for a blocked buyer tier", async () => {
		const payload = world({
			buyerPhoneScores: [
				{
					phoneHash: hashOf(BUYER_PHONE),
					ordersPlaced: 3,
					ordersDelivered: 3,
					cancelledAfterAccept: 0,
					blockedOverride: "none",
					refusals: [
						{ order: "o-1", reason: "refused", at: NOW.toISOString() },
						{ order: "o-2", reason: "refused", at: NOW.toISOString() },
						{ order: "o-3", reason: "refused", at: NOW.toISOString() },
					],
				},
			],
		});
		await expect(
			quoteCheckout(payload, BUYER, baseInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "order.codUnavailable", status: 409 });
	});

	it("refuses order.buyerCapReached when the buyer's own open-order cap is reached", async () => {
		// Tier `new` caps open orders at 1; one already open trips it.
		const payload = world({
			orders: [
				{
					id: "o-100",
					buyer: "u-buyer",
					shop: "s-1",
					status: "placed",
					timestamps: { placedAt: NOW.toISOString() },
				},
			],
		});
		await expect(
			quoteCheckout(payload, BUYER, baseInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "order.buyerCapReached", status: 409 });
	});

	it("refuses order.shopCapReached when the shop's daily cap is reached", async () => {
		// Level 1's daily cap is 20; twenty other buyers' orders today trip it,
		// while this buyer's own open-order count stays at 0.
		const fillerOrders = Array.from({ length: 20 }, (_, i) => ({
			id: `o-filler-${i}`,
			buyer: `u-filler-${i}`,
			shop: "s-1",
			status: "placed",
			timestamps: { placedAt: NOW.toISOString() },
		}));
		const payload = world({ orders: fillerOrders });
		await expect(
			quoteCheckout(payload, BUYER, baseInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "order.shopCapReached", status: 409 });
	});

	it("the stricter of the two caps names itself", async () => {
		// A `new` buyer's own total cap (75 000) is stricter than the shop's
		// (150 000): an 80 000 order breaches the buyer's cap, not the shop's.
		const buyerStricter = world({ variant: { price: 80_000 } });
		await expect(
			quoteCheckout(buyerStricter, BUYER, baseInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "order.buyerCapReached" });

		// A `trusted` buyer has no total cap of their own: the shop's 150 000
		// is what a 160 000 order breaches.
		const trustedPayload = world({
			variant: { price: 160_000 },
			buyerPhoneScores: [
				{
					phoneHash: hashOf(BUYER_PHONE),
					ordersPlaced: 3,
					ordersDelivered: 3,
					cancelledAfterAccept: 0,
					blockedOverride: "none",
					refusals: [],
				},
			],
		});
		await expect(
			quoteCheckout(trustedPayload, BUYER, baseInput(), {
				now: NOW,
				store: new MemoryCounterStore(),
			}),
		).rejects.toMatchObject({ code: "order.shopCapReached" });
	});
});

describe("quoteCheckout: the successful quote", () => {
	it("returns the summary, the pre-contract and the hash", async () => {
		const payload = world();
		const quote = await quoteCheckout(payload, BUYER, baseInput(), {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		expect(quote.summary.subtotal).toBe(10_000);
		expect(quote.summary.deliveryFee).toBe(2_000);
		expect(quote.summary.total).toBe(12_000);
		expect(quote.summary.items).toHaveLength(1);
		expect(quote.preContract.termsVersion).toBe("2026-09");
		expect(quote.preContract.amounts.total).toBe(12_000);
		expect(quote.confirmationRequired).toBe("sms_code");
		expect(quote.quoteHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("the hash is the one place() will recompute", async () => {
		const payload = world();
		const quote = await quoteCheckout(payload, BUYER, baseInput(), {
			now: NOW,
			store: new MemoryCounterStore(),
		});

		const recomputed = quoteHash({
			lines: [
				{ lineId: "i-1", variantId: "v-1", quantity: 1, unitPrice: 10_000 },
			],
			deliveryFee: 2_000,
			method: "seller_delivery",
			city: "douala",
			paymentMethod: "cod",
			termsVersion: "2026-09",
		});
		expect(quote.quoteHash).toBe(recomputed);
	});

	it("quotes are not stored", async () => {
		const payload = world();
		await quoteCheckout(payload, BUYER, baseInput(), {
			now: NOW,
			store: new MemoryCounterStore(),
		});
		expect(payload.writes).toHaveLength(0);
	});
});

describe("quoteCheckout: the rate limit", () => {
	function seedMinimalUsers(payload: FakePayload, ids: string[]) {
		for (const id of ids) {
			payload.store.users.push({ id, name: id });
		}
	}

	it("refuses the eleventh call in an hour per user", async () => {
		const payload = world();
		seedMinimalUsers(payload, ["u-rl-single"]);
		const store = new MemoryCounterStore(() => NOW.getTime());
		const user = { id: "u-rl-single" };

		const codes: unknown[] = [];
		for (let i = 0; i < 11; i++) {
			codes.push(
				await codeOf(
					quoteCheckout(payload, user, baseInput(), {
						now: NOW,
						store,
						ip: "203.0.113.1",
					}),
				),
			);
		}
		expect(codes.slice(0, 10)).not.toContain("generic.rateLimited");
		expect(codes[10]).toBe("generic.rateLimited");
	});

	it("refuses the thirty-first call in an hour per IP", async () => {
		const payload = world();
		const ids = Array.from({ length: 31 }, (_, i) => `u-rl-ip-${i}`);
		seedMinimalUsers(payload, ids);
		const store = new MemoryCounterStore(() => NOW.getTime());

		const codes: unknown[] = [];
		for (const id of ids) {
			codes.push(
				await codeOf(
					quoteCheckout(payload, { id }, baseInput(), {
						now: NOW,
						store,
						ip: "203.0.113.9",
					}),
				),
			);
		}
		expect(codes.slice(0, 30)).not.toContain("generic.rateLimited");
		expect(codes[30]).toBe("generic.rateLimited");
	});

	it("exposes the exact windows: 10/hour per user, 30/hour per IP", () => {
		expect(QUOTE_RATE_LIMITS.perUser).toEqual([
			{ name: "checkout-quote:user", limit: 10, windowSeconds: 3600 },
		]);
		expect(QUOTE_RATE_LIMITS.perIp).toEqual([
			{ name: "checkout-quote:ip", limit: 30, windowSeconds: 3600 },
		]);
	});
});
