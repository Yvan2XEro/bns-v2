// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { anonymizeIdentifier, retainedWebhookRaw } from "../../src/lib/redact";
import { deleteUserRelatedData } from "../../src/services/accountDeletion";
import { fakePayload } from "./helpers/fakePayload";

vi.mock("../../src/auth/oauth/providers", () => ({
	createAppleClientSecretFor: vi.fn(),
}));
vi.mock("../../src/services/notificationProvider", () => ({
	isNotificationProviderConfigured: () => false,
	getNotificationProvider: vi.fn(),
}));

const NOW = new Date("2026-09-15T10:00:00.000Z");

function world() {
	return fakePayload({
		users: [{ id: "u-1" }, { id: "u-2" }],
		listings: [{ id: "l-1", seller: "u-1", images: [] }],
		"boost-payments": [
			{
				id: "bp-1",
				listing: "l-1",
				user: "u-1",
				amount: 900,
				status: "completed",
			},
			{
				id: "bp-2",
				listing: "l-9",
				user: "u-2",
				amount: 500,
				status: "completed",
			},
		],
		"payment-intents": [
			{
				id: "pi-1",
				customer: "u-1",
				reference: "PI-pi-1",
				amount: 900,
				currency: "XAF",
				providerReference: "trx.1",
				status: "succeeded",
				idempotencyKey: "boost:u-1:key-1",
				statusHistory: [
					{
						status: "succeeded",
						source: "webhook",
						at: "2026-09-01T00:00:00.000Z",
					},
				],
			},
			{
				id: "pi-2",
				customer: "u-2",
				reference: "PI-pi-2",
				amount: 500,
				currency: "XAF",
				status: "succeeded",
				idempotencyKey: "boost:u-2:key-2",
			},
		],
		"webhook-events": [
			{
				id: "we-1",
				provider: "notchpay",
				reference: "PI-pi-1",
				payloadHash: "hash-1",
				raw: {
					id: "evt_1",
					event: "payment.complete",
					data: {
						merchant_reference: "PI-pi-1",
						trxref: "PI-pi-1",
						reference: "trx.1",
						amount: 900,
						currency: "XAF",
						status: "complete",
						customer: {
							id: "cus_notch_1",
							email: "a@example.com",
							name: "Awa",
							phone: "+237600000001",
						},
					},
				},
			},
			{
				id: "we-2",
				provider: "notchpay",
				reference: "PI-pi-2",
				payloadHash: "hash-2",
				raw: {
					id: "evt_2",
					event: "payment.complete",
					data: {
						merchant_reference: "PI-pi-2",
						amount: 500,
						currency: "XAF",
						status: "complete",
						customer: { email: "b@example.com" },
					},
				},
			},
		],
		"contact-reveals": [
			{ id: "cr-1", viewer: "u-1", seller: "u-2", listing: "l-9" },
			{ id: "cr-2", viewer: "u-2", seller: "u-1", listing: "l-1" },
			{ id: "cr-3", viewer: "u-2", seller: "u-3", listing: "l-8" },
		],
	});
}

describe("anonymizeIdentifier", () => {
	it("is deterministic and does not embed the id", () => {
		const hashed = anonymizeIdentifier("u-1");
		expect(hashed).toBe(anonymizeIdentifier("u-1"));
		expect(hashed).not.toContain("u-1");
	});

	it("gives different users different replacements", () => {
		expect(anonymizeIdentifier("u-1")).not.toBe(anonymizeIdentifier("u-2"));
	});
});

describe("retainedWebhookRaw", () => {
	it("keeps only the payment's identifiers, status, amount, currency and event type", () => {
		expect(
			retainedWebhookRaw("notchpay", {
				id: "evt_1",
				event: "payment.complete",
				data: {
					merchant_reference: "PI-pi-1",
					reference: "trx.1",
					amount: 900,
					currency: "XAF",
					status: "complete",
					customer: { id: "cus_notch_1", email: "a@x", name: "A", phone: "1" },
				},
			}),
		).toEqual({
			providerEventId: "evt_1",
			type: "payment.complete",
			reference: "PI-pi-1",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: "trx.1",
		});
	});

	it("drops Stripe's reusable customer id, which no key-name denylist catches", () => {
		const result = retainedWebhookRaw("stripe", {
			id: "evt_stripe_1",
			type: "checkout.session.completed",
			data: {
				object: {
					object: "checkout.session",
					id: "cs_1",
					customer: "cus_reusable_123",
					customer_email: "a@x.com",
					payment_status: "paid",
					status: "complete",
					amount_total: 900,
					currency: "xaf",
					metadata: { reference: "PI-pi-1" },
				},
			},
		});
		expect(JSON.stringify(result)).not.toContain("cus_reusable_123");
		expect(JSON.stringify(result)).not.toContain("a@x.com");
		expect(result).toEqual({
			providerEventId: "evt_stripe_1",
			type: "checkout.session.completed",
			reference: "PI-pi-1",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: "cs_1",
		});
	});

	it("does not strip a generic key like a line item's product name", () => {
		// A denylist keyed on "name" would strip this; the allowlist never looks
		// at it in the first place because it only reads the normalised fields.
		const result = retainedWebhookRaw("notchpay", {
			id: "evt_2",
			event: "payment.complete",
			data: {
				amount: 900,
				currency: "XAF",
				status: "complete",
				lineItems: [{ name: "Boost annonce: iPhone 12" }],
			},
		});
		expect(result).not.toHaveProperty("lineItems");
		expect(result).toEqual({
			providerEventId: "evt_2",
			type: "payment.complete",
			reference: "",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: null,
		});
	});
});

describe("deleteUserRelatedData payment retention", () => {
	let payload: ReturnType<typeof world>;

	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		payload = world();
		await deleteUserRelatedData(payload as never, { id: "u-1" });
		vi.useRealTimers();
	});

	it("keeps the boost payment without its customer", () => {
		expect(
			payload.store["boost-payments"].find((b) => b.id === "bp-1"),
		).toMatchObject({
			user: null,
			customerDeletedAt: NOW.toISOString(),
			amount: 900,
			status: "completed",
		});
	});

	it("keeps the intent and its history without its customer", () => {
		expect(
			payload.store["payment-intents"].find((i) => i.id === "pi-1"),
		).toMatchObject({
			customer: null,
			customerDeletedAt: NOW.toISOString(),
			amount: 900,
			currency: "XAF",
			providerReference: "trx.1",
			statusHistory: [{ status: "succeeded", source: "webhook" }],
		});
	});

	it("replaces the deleted user's raw id inside the kept intent's idempotency key", () => {
		const intent = payload.store["payment-intents"].find(
			(i) => i.id === "pi-1",
		);
		expect(intent?.idempotencyKey).toBe(
			`boost:${anonymizeIdentifier("u-1")}:key-1`,
		);
		expect(String(intent?.idempotencyKey)).not.toContain("u-1");
	});

	it("redacts the stored webhook body and keeps its hash", () => {
		const event = payload.store["webhook-events"].find((e) => e.id === "we-1");
		expect(event?.payloadHash).toBe("hash-1");
		expect(event?.raw).toEqual({
			providerEventId: "evt_1",
			type: "payment.complete",
			reference: "PI-pi-1",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: "trx.1",
		});
		const serialized = JSON.stringify(event?.raw);
		expect(serialized).not.toContain("a@example.com");
		expect(serialized).not.toContain("Awa");
		expect(serialized).not.toContain("+237600000001");
		expect(serialized).not.toContain("cus_notch_1");
	});

	it("leaves other customers' records untouched", () => {
		expect(
			payload.store["payment-intents"].find((i) => i.id === "pi-2")?.customer,
		).toBe("u-2");
		expect(
			payload.store["payment-intents"].find((i) => i.id === "pi-2")
				?.idempotencyKey,
		).toBe("boost:u-2:key-2");
		expect(
			payload.store["boost-payments"].find((b) => b.id === "bp-2")?.user,
		).toBe("u-2");
		expect(
			payload.store["webhook-events"].find((e) => e.id === "we-2")?.raw.data
				.customer.email,
		).toBe("b@example.com");
	});

	it("deletes the user's contact reveals as viewer and as seller", () => {
		expect(payload.store["contact-reveals"].map((r) => r.id)).toEqual(["cr-3"]);
	});

	it("is idempotent: re-running after success touches nothing further", async () => {
		const before = structuredClone(payload.store);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-09-16T00:00:00.000Z"));
		await deleteUserRelatedData(payload as never, { id: "u-1" });
		vi.useRealTimers();
		expect(payload.store).toEqual(before);
	});
});

describe("deleteUserRelatedData transactional cascade", () => {
	it("rolls back every write when the cascade fails partway through", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		const failing = world();
		const realDelete = failing.delete;
		const wrapped = {
			...failing,
			delete: (options: { collection: string; id: unknown }) => {
				if (options.collection === "listings") {
					return Promise.reject(new Error("boom"));
				}
				return realDelete(options as Parameters<typeof realDelete>[0]);
			},
		};

		await expect(
			deleteUserRelatedData(wrapped as never, { id: "u-1" }),
		).rejects.toThrow("boom");
		vi.useRealTimers();

		expect(
			failing.store["payment-intents"].find((i) => i.id === "pi-1")?.customer,
		).toBe("u-1");
		expect(
			failing.store["boost-payments"].find((b) => b.id === "bp-1")?.user,
		).toBe("u-1");
		expect(failing.store["contact-reveals"].map((r) => r.id).sort()).toEqual([
			"cr-1",
			"cr-2",
			"cr-3",
		]);
		expect(failing.store.listings.map((l) => l.id)).toEqual(["l-1"]);
		expect(
			failing.store["webhook-events"].find((e) => e.id === "we-1")?.raw.data
				.customer.email,
		).toBe("a@example.com");
	});
});
