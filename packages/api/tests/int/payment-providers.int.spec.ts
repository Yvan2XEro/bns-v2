// @vitest-environment node
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotchPayProvider } from "../../src/lib/payments/notchpay";
import { StripeProvider } from "../../src/lib/payments/stripe";
import { WebhookSignatureError } from "../../src/lib/payments/types";

const HASH_KEY = "notch-hash-key";
const notchpay = () =>
	new NotchPayProvider("pk_test", "https://notchpay.test", HASH_KEY);
const notchEvent = (event: string, status: string) =>
	JSON.stringify({
		id: "evt_n1",
		event,
		data: {
			merchant_reference: "PI-abc",
			trxref: "PI-abc",
			reference: "trx.123",
			amount: 900,
			currency: "XAF",
			status,
		},
	});
const sign = (body: string, key = HASH_KEY) =>
	createHmac("sha256", key).update(body).digest("hex");

describe("NotchPayProvider.verifyWebhook", () => {
	const body = notchEvent("payment.complete", "complete");

	it("returns the normalised event for a valid signature", async () => {
		await expect(
			notchpay().verifyWebhook(body, { "x-notch-signature": sign(body) }),
		).resolves.toEqual({
			providerEventId: "evt_n1",
			type: "payment.complete",
			reference: "PI-abc",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: "trx.123",
		});
	});

	it("rejects a signature made with another key", async () => {
		await expect(
			notchpay().verifyWebhook(body, {
				"x-notch-signature": sign(body, "other"),
			}),
		).rejects.toBeInstanceOf(WebhookSignatureError);
	});

	it("rejects a missing or malformed signature", async () => {
		await expect(notchpay().verifyWebhook(body, {})).rejects.toBeInstanceOf(
			WebhookSignatureError,
		);
		await expect(
			notchpay().verifyWebhook(body, { "x-notch-signature": "zz" }),
		).rejects.toBeInstanceOf(WebhookSignatureError);
	});

	it("refuses to run without a hash key", async () => {
		await expect(
			new NotchPayProvider("pk_test").verifyWebhook(body, {
				"x-notch-signature": sign(body),
			}),
		).rejects.toThrow("NOTCHPAY_HASH_KEY");
	});

	it.each([
		["payment.failed", "failed", "failed"],
		["payment.canceled", "canceled", "cancelled"],
		["payment.expired", "expired", "expired"],
	])("maps %s to %s", (type, status, expected) => {
		expect(
			notchpay().parseWebhookEvent(JSON.parse(notchEvent(type, status))).status,
		).toBe(expected);
	});
});

describe("NotchPayProvider.verifyPayment", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("normalises the transaction NotchPay returns", async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({
				transaction: {
					reference: "trx.123",
					merchant_reference: "PI-abc",
					amount: 900,
					currency: "xaf",
					status: "complete",
				},
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(notchpay().verifyPayment("trx.123")).resolves.toEqual({
			reference: "PI-abc",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: "trx.123",
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"https://notchpay.test/payments/trx.123",
			expect.anything(),
		);
	});

	it("throws when NotchPay answers with an error status", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("", { status: 503 })),
		);
		await expect(notchpay().verifyPayment("trx.123")).rejects.toThrow("503");
	});
});

describe("StripeProvider", () => {
	const SECRET = "whsec_test_secret";
	const stripe = () => new StripeProvider("sk_test_123", SECRET);
	const session = (overrides: Record<string, unknown> = {}) => ({
		id: "evt_s1",
		object: "event",
		type: "checkout.session.completed",
		data: {
			object: {
				id: "cs_1",
				object: "checkout.session",
				amount_total: 900,
				currency: "xaf",
				payment_status: "paid",
				status: "complete",
				metadata: { reference: "PI-abc" },
				...overrides,
			},
		},
	});

	it("verifies a signed Checkout event", async () => {
		const body = JSON.stringify(session());
		const header = Stripe.webhooks.generateTestHeaderString({
			payload: body,
			secret: SECRET,
		});
		await expect(
			stripe().verifyWebhook(body, { "stripe-signature": header }),
		).resolves.toEqual({
			providerEventId: "evt_s1",
			type: "checkout.session.completed",
			reference: "PI-abc",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: "cs_1",
		});
	});

	it("rejects an event signed with another secret", async () => {
		const body = JSON.stringify(session());
		const header = Stripe.webhooks.generateTestHeaderString({
			payload: body,
			secret: "whsec_other",
		});
		await expect(
			stripe().verifyWebhook(body, { "stripe-signature": header }),
		).rejects.toBeInstanceOf(WebhookSignatureError);
	});

	it("reads an unpaid completed session as pending", () => {
		expect(
			stripe().parseWebhookEvent(session({ payment_status: "unpaid" })).status,
		).toBe("pending");
	});

	it("reads an expired session as expired", () => {
		const event = { ...session(), type: "checkout.session.expired" };
		expect(stripe().parseWebhookEvent(event).status).toBe("expired");
	});
});
