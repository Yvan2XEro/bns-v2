// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { BOOST_PRICING, findBoostPrice } from "../../src/lib/boostPricing";
import {
	BoostPurchaseError,
	startBoostPurchase,
} from "../../src/services/boostPurchase";
import { fakePayload } from "./helpers/fakePayload";

function provider() {
	return {
		id: "notchpay" as const,
		createPayment: vi.fn(async () => ({
			checkoutUrl: "https://pay.test/checkout/1",
			providerReference: "trx.1",
		})),
		verifyWebhook: vi.fn(),
		parseWebhookEvent: vi.fn(),
		verifyPayment: vi.fn(),
	};
}

function world(listing: Record<string, unknown> = {}) {
	return fakePayload(
		{
			listings: [
				{
					id: "l-1",
					title: "Bike",
					seller: "u-1",
					status: "published",
					...listing,
				},
			],
		},
		{ uniques: { "payment-intents": [["idempotencyKey"]] } },
	);
}

const input = {
	userId: "u-1",
	email: "seller@example.com",
	listingId: "l-1",
	duration: "14",
	providerName: "notchpay",
	serverUrl: "https://api.test",
};

describe("boost pricing", () => {
	it("keeps the published prices", () => {
		expect(BOOST_PRICING).toEqual([
			{ days: 7, amount: 500, currency: "XAF" },
			{ days: 14, amount: 900, currency: "XAF" },
			{ days: 30, amount: 1500, currency: "XAF" },
		]);
	});

	it("accepts a duration as string or number and nothing else", () => {
		expect(findBoostPrice("14")?.amount).toBe(900);
		expect(findBoostPrice(30)?.amount).toBe(1500);
		expect(findBoostPrice("15")).toBeNull();
		expect(findBoostPrice("7 days")).toBeNull();
	});
});

describe("startBoostPurchase", () => {
	it("creates the boost payment and its intent, then stores the checkout", async () => {
		const payload = world();
		const p = provider();
		const result = await startBoostPurchase(payload, input, {
			getProvider: () => p,
		});

		const boost = payload.store["boost-payments"][0];
		const intent = payload.store["payment-intents"][0];
		expect(boost).toMatchObject({
			listing: "l-1",
			user: "u-1",
			amount: 900,
			duration: "14",
			status: "pending",
			paymentProvider: "notchpay",
			paymentIntent: intent.id,
			paymentReference: "trx.1",
			paymentUrl: "https://pay.test/checkout/1",
		});
		expect(intent).toMatchObject({
			purpose: "boost",
			targetId: boost.id,
			customer: "u-1",
			amount: 900,
			currency: "XAF",
			reference: `PI-${intent.id}`,
			status: "pending",
			providerReference: "trx.1",
			checkoutUrl: "https://pay.test/checkout/1",
		});
		expect(p.createPayment).toHaveBeenCalledWith(
			expect.objectContaining({
				reference: `PI-${intent.id}`,
				amount: 900,
				currency: "XAF",
			}),
		);
		expect(result).toEqual({
			paymentId: boost.id,
			intentId: intent.id,
			provider: "notchpay",
			checkoutUrl: "https://pay.test/checkout/1",
			clientSecret: null,
		});
	});

	it.each([
		["another seller's listing", { seller: "u-2" }, "boost.notOwner", 403],
		[
			"an unpublished listing",
			{ status: "draft" },
			"boost.listingNotPublished",
			409,
		],
	])("refuses %s and writes nothing", async (_label, listing, code, status) => {
		const payload = world(listing);
		await expect(
			startBoostPurchase(payload, input, { getProvider: provider }),
		).rejects.toMatchObject({ code, status });
		expect(payload.store["boost-payments"] ?? []).toHaveLength(0);
		expect(payload.store["payment-intents"] ?? []).toHaveLength(0);
	});

	it("refuses a duration that is not on the price list", async () => {
		await expect(
			startBoostPurchase(
				world(),
				{ ...input, duration: "15" },
				{ getProvider: provider },
			),
		).rejects.toMatchObject({ code: "boost.invalidDuration", status: 400 });
	});

	it("answers 404 for a missing listing", async () => {
		await expect(
			startBoostPurchase(
				world(),
				{ ...input, listingId: "nope" },
				{ getProvider: provider },
			),
		).rejects.toMatchObject({ code: "listing.notFound", status: 404 });
	});

	it("answers 503 when the provider is not configured", async () => {
		await expect(
			startBoostPurchase(world(), input, {
				getProvider: () => {
					throw new Error("Stripe non configuré");
				},
			}),
		).rejects.toMatchObject({
			code: "payment.providerUnavailable",
			status: 503,
		});
	});

	it("fails the intent and the boost payment when the provider refuses", async () => {
		const payload = world();
		const p = provider();
		p.createPayment.mockRejectedValueOnce(new Error("NotchPay (500)"));

		await expect(
			startBoostPurchase(payload, input, { getProvider: () => p }),
		).rejects.toBeInstanceOf(BoostPurchaseError);
		expect(payload.store["payment-intents"][0].status).toBe("failed");
		expect(payload.store["boost-payments"][0].status).toBe("failed");
	});

	it("leaves neither the intent pending nor the boost payment referenced when the legacy field write fails", async () => {
		const payload = world();
		const p = provider();
		const originalUpdate = payload.update.bind(payload);
		payload.update = (async (args: Parameters<typeof originalUpdate>[0]) => {
			const data = args.data as Record<string, unknown>;
			if ("paymentReference" in data) throw new Error("Mongo write failed");
			return originalUpdate(args);
		}) as typeof payload.update;

		await expect(
			startBoostPurchase(payload, input, { getProvider: () => p }),
		).rejects.toThrow("Mongo write failed");

		const intent = payload.store["payment-intents"][0];
		const boost = payload.store["boost-payments"][0];
		// The provider call already returned a real checkout: an intent left
		// `pending` with that checkout, next to a boost payment whose legacy
		// `paymentReference`/`paymentUrl` never landed, is exactly the state a
		// released app version cannot act on.
		expect(intent.status).not.toBe("pending");
		expect(intent.checkoutUrl ?? null).toBeNull();
		expect(boost.paymentReference ?? null).toBeNull();
		expect(boost.paymentUrl ?? null).toBeNull();
	});

	it("replays a pending purchase for the same idempotency key", async () => {
		const payload = world();
		const p = provider();
		const first = await startBoostPurchase(
			payload,
			{ ...input, idempotencyKey: "abc" },
			{ getProvider: () => p },
		);
		const second = await startBoostPurchase(
			payload,
			{ ...input, idempotencyKey: "abc" },
			{ getProvider: () => p },
		);

		expect(second).toEqual(first);
		expect(p.createPayment).toHaveBeenCalledTimes(1);
		expect(payload.store["payment-intents"][0].idempotencyKey).toBe(
			"boost:u-1:abc",
		);
	});
});
