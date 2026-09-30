// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Listings } from "../../src/collections/Listings";
import { NotchPayProvider } from "../../src/lib/payments/notchpay";
import { anonymizeIdentifier, retainedWebhookRaw } from "../../src/lib/redact";
import { deleteUserRelatedData } from "../../src/services/accountDeletion";
import { processWebhookEvent } from "../../src/services/webhookEvents";
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
			{
				// No merchant reference and no trxref: the body is keyed on the
				// provider's transaction id alone, the way every Stripe event
				// that is not `checkout.session.*` is stored.
				id: "we-3",
				provider: "notchpay",
				providerReference: "trx.1",
				payloadHash: "hash-3",
				raw: {
					id: "evt_3",
					event: "payment.failed",
					data: {
						reference: "trx.1",
						amount: 900,
						currency: "XAF",
						status: "failed",
						customer: {
							id: "cus_notch_1",
							email: "a@example.com",
							name: "Awa",
							phone: "+237600000001",
						},
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

	it("refuses to degrade to an unsalted digest when the secret is unset", () => {
		vi.stubEnv("PAYLOAD_SECRET", "");
		expect(() => anonymizeIdentifier("u-1")).toThrow(
			"PAYLOAD_SECRET environment variable is not set",
		);
		vi.unstubAllEnvs();
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
			redacted: true,
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
			redacted: true,
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
			redacted: true,
		});
	});

	it("is idempotent: a body already rebuilt is returned unchanged, not re-parsed", () => {
		const already = {
			providerEventId: "evt_1",
			type: "payment.complete",
			reference: "PI-pi-1",
			status: "succeeded" as const,
			amount: 900,
			currency: "XAF",
			providerTransactionId: "trx.1",
			redacted: true as const,
		};
		expect(retainedWebhookRaw("notchpay", already)).toEqual(already);
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

	afterEach(() => {
		vi.unstubAllEnvs();
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

	it("redacts a body the intent names only by the provider transaction id", () => {
		const event = payload.store["webhook-events"].find((e) => e.id === "we-3");
		const serialized = JSON.stringify(event?.raw);
		expect(event?.raw).toMatchObject({ redacted: true });
		expect(serialized).not.toContain("a@example.com");
		expect(serialized).not.toContain("Awa");
		expect(serialized).not.toContain("+237600000001");
		expect(serialized).not.toContain("cus_notch_1");
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
			redacted: true,
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

	it("joins the caller's ambient transaction instead of opening a second one", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		const payload = world();
		const beginTransaction = vi.spyOn(payload.db, "beginTransaction");
		const ambientReq = { payload, transactionID: "ambient-tx-1" };

		await deleteUserRelatedData(
			payload as never,
			{ id: "u-1" },
			ambientReq as never,
		);
		vi.useRealTimers();

		expect(beginTransaction).not.toHaveBeenCalled();
		expect(
			payload.store["payment-intents"].find((i) => i.id === "pi-1")?.customer,
		).toBeNull();
	});

	it("opens its own transaction when called standalone", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		const payload = world();
		const beginTransaction = vi.spyOn(payload.db, "beginTransaction");

		await deleteUserRelatedData(payload as never, { id: "u-1" });
		vi.useRealTimers();

		expect(beginTransaction).toHaveBeenCalledTimes(1);
	});

	it("(no replicaSet) converges on re-run from a crash between redacting webhooks and anonymising intents", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		const payload = world();
		// Mirrors production without Task 18's replicaSet: transactions are a
		// no-op, so every write here lands immediately and is never rolled back.
		const noTx = {
			...payload,
			db: { ...payload.db, beginTransaction: async () => undefined },
		};
		const realUpdate = payload.update.bind(payload);
		let crashed = false;
		const wrapped = {
			...noTx,
			update: (options: { collection: string; [key: string]: unknown }) => {
				if (!crashed && options.collection === "payment-intents") {
					crashed = true;
					return Promise.reject(new Error("boom"));
				}
				return realUpdate(options as Parameters<typeof realUpdate>[0]);
			},
		};

		await expect(
			deleteUserRelatedData(wrapped as never, { id: "u-1" }),
		).rejects.toThrow("boom");

		// The webhook body is already safe; the intent has not been reached yet.
		expect(
			payload.store["webhook-events"].find((e) => e.id === "we-1")?.raw,
		).toMatchObject({ redacted: true, reference: "PI-pi-1" });
		expect(
			payload.store["payment-intents"].find((i) => i.id === "pi-1")?.customer,
		).toBe("u-1");

		// A re-run (same lack of a transaction) finds the same intent — its
		// customer is still set — redacts the already-safe webhook body as a
		// no-op, and finishes anonymising the intent.
		await deleteUserRelatedData(payload as never, { id: "u-1" });
		vi.useRealTimers();

		expect(
			payload.store["payment-intents"].find((i) => i.id === "pi-1"),
		).toMatchObject({
			customer: null,
			idempotencyKey: `boost:${anonymizeIdentifier("u-1")}:key-1`,
		});
		expect(
			payload.store["webhook-events"].find((e) => e.id === "we-1")?.raw,
		).toEqual({
			providerEventId: "evt_1",
			type: "payment.complete",
			reference: "PI-pi-1",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: "trx.1",
			redacted: true,
		});
	});
});

describe("replaying an unprocessed webhook after the account is deleted", () => {
	it("still settles the intent from the redacted, already-normalised body", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		const payload = fakePayload(
			{
				listings: [{ id: "l-3", status: "published", boostedUntil: null }],
				"boost-payments": [
					{
						id: "bp-3",
						listing: "l-3",
						duration: "7",
						status: "pending",
						amount: 900,
					},
				],
				"payment-intents": [
					{
						id: "pi-3",
						customer: "u-1",
						purpose: "boost",
						targetType: "boost-payment",
						targetId: "bp-3",
						amount: 900,
						currency: "XAF",
						status: "pending",
						reference: "PI-pi-3",
						idempotencyKey: "boost:u-1:replay-key",
						statusHistory: [],
					},
				],
				"webhook-events": [
					{
						id: "we-3",
						provider: "notchpay",
						reference: "PI-pi-3",
						payloadHash: "hash-3",
						raw: {
							id: "evt_3",
							event: "payment.complete",
							data: {
								merchant_reference: "PI-pi-3",
								reference: "trx.3",
								amount: 900,
								currency: "XAF",
								status: "complete",
								customer: {
									email: "c@example.com",
									name: "Chantal",
									phone: "+237600000099",
								},
							},
						},
					},
				],
			},
			{ uniques: { "webhook-events": [["provider", "providerEventId"]] } },
		);

		// The user deletes their account while the event is still in flight,
		// unprocessed — a real race, not a contrived one.
		await deleteUserRelatedData(payload as never, { id: "u-1" });
		vi.useRealTimers();

		const redactedEvent = payload.store["webhook-events"].find(
			(e) => e.id === "we-3",
		);
		expect(redactedEvent?.processedAt).toBeUndefined();
		expect(redactedEvent?.raw).toMatchObject({
			redacted: true,
			reference: "PI-pi-3",
		});
		expect(JSON.stringify(redactedEvent?.raw)).not.toContain("c@example.com");

		const notchpay = new NotchPayProvider(
			"pk",
			"https://notchpay.test",
			"hash",
		);
		const result = await processWebhookEvent(payload, "we-3", {
			getProvider: () => notchpay,
		});

		expect(result).toEqual({ outcome: "applied" });
		expect(
			payload.store["payment-intents"].find((i) => i.id === "pi-3")?.status,
		).toBe("succeeded");
		expect(
			payload.store["webhook-events"].find((e) => e.id === "we-3")?.processedAt,
		).toEqual(expect.any(String));
	});
});

describe("deleting a shopkeeper who still has a product listing", () => {
	const beforeDelete = Listings.hooks?.beforeDelete?.[0] as (
		args: unknown,
	) => Promise<void>;

	/**
	 * `payload.delete` runs `beforeDelete` even under `overrideAccess`, and the
	 * fake does not run hooks, so the cascade's one real obstacle is wired in
	 * here by hand. Without it this file cannot see the guard at all.
	 */
	function guarded(payload: ReturnType<typeof world>) {
		const realDelete = payload.delete;
		return {
			...payload,
			delete: async (options: {
				collection: string;
				id: unknown;
				context?: Record<string, unknown>;
			}) => {
				if (options.collection === "listings") {
					await beforeDelete({
						id: options.id,
						req: {
							payload,
							user: { id: "u-1" },
							context: options.context ?? {},
						},
					});
				}
				return realDelete(options as Parameters<typeof realDelete>[0]);
			},
		};
	}

	function shopWorld() {
		const payload = world();
		payload.store.listings.push({
			id: "l-2",
			seller: "u-1",
			shop: "s-1",
			product: "p-1",
			status: "published",
			images: [],
		});
		return payload;
	}

	it("completes, and the product listing goes with the account", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		const payload = shopWorld();

		await deleteUserRelatedData(guarded(payload) as never, { id: "u-1" });
		vi.useRealTimers();

		expect(payload.store.listings).toHaveLength(0);
		expect(
			payload.store["payment-intents"].find((i) => i.id === "pi-1")?.customer,
		).toBeNull();
	});

	it("still refuses the shopkeeper deleting that same listing by hand", async () => {
		const payload = shopWorld();

		await expect(
			guarded(payload).delete({ collection: "listings", id: "l-2" }),
		).rejects.toThrow(/through its product/);
		expect(payload.store.listings.map((l) => l.id)).toContain("l-2");
	});
});

describe("closing an owned shop atomically with account deletion", () => {
	function ownedShopWorld() {
		const payload = world();
		payload.store.shops = [
			{ id: "s-1", handle: "shopkeeper", status: "active", owner: "u-1" },
		];
		payload.store.products = [
			{
				id: "p-1",
				shop: "s-1",
				title: "Product",
				status: "active",
				listing: "l-2",
			},
		];
		payload.store.listings.push({
			id: "l-2",
			seller: "u-1",
			shop: "s-1",
			product: "p-1",
			status: "published",
			images: [],
		});
		return payload;
	}

	it("closes the shop and archives its product in the same transaction as the rest of the cascade", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		const payload = ownedShopWorld();

		await deleteUserRelatedData(payload as never, { id: "u-1" });
		vi.useRealTimers();

		expect(payload.store.shops[0]).toMatchObject({
			status: "closed",
			closedAt: NOW.toISOString(),
		});
		expect(payload.store.products[0]).toMatchObject({
			status: "archived",
			listing: null,
		});
		expect(payload.store.listings).toHaveLength(0);

		// The direct proof this is one transaction, not one per shop plus the
		// cascade's own: every write the run made — closing the shop, archiving
		// the product, detaching then deleting the listing, and the rest of the
		// cascade — carries the same transaction id.
		const transactionIds = new Set(payload.writes.map((w) => w.transactionID));
		expect(transactionIds.size).toBe(1);
		expect([...transactionIds][0]).toBeTruthy();
	});

	it("rolls back the shop closure too when the cascade fails", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		const payload = ownedShopWorld();
		const realDelete = payload.delete;
		const wrapped = {
			...payload,
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

		// Had the closure run in its own, already-committed transaction, this
		// would still show the shop closed and the product archived even though
		// the account and its cascade failed to delete.
		expect(payload.store.shops[0]).toMatchObject({ status: "active" });
		expect(payload.store.shops[0].closedAt).toBeFalsy();
		expect(payload.store.products[0]).toMatchObject({
			status: "active",
			listing: "l-2",
		});
		expect(payload.store.listings.find((l) => l.id === "l-2")).toMatchObject({
			shop: "s-1",
			product: "p-1",
		});
	});
});

describe("verification data on account deletion", () => {
	function ownedShopWorldWithRequests() {
		const payload = world();
		payload.store.shops = [
			{ id: "s-1", handle: "shopkeeper", status: "active", owner: "u-1" },
			// A shop the seller had already closed before deleting the account:
			// I7's exact gap — excluded from the old, active/suspended-only scope.
			{ id: "s-2", handle: "closed-shop", status: "closed", owner: "u-1" },
		];
		payload.store["verification-requests"] = [
			{
				id: "vr-decided",
				shop: "s-1",
				submittedBy: "u-1",
				requestedLevel: 2,
				status: "approved",
				kyc: {
					givenNames: "Aicha",
					familyName: "Mbappe",
					documentNumberHash: "hash-a",
				},
			},
			{
				id: "vr-open",
				shop: "s-1",
				submittedBy: "u-1",
				requestedLevel: 3,
				status: "draft",
				openKey: "s-1:3",
			},
			{
				id: "vr-closed-shop",
				shop: "s-2",
				submittedBy: "u-1",
				requestedLevel: 2,
				status: "rejected",
				kyc: { provider: "didit", sessionRef: "sess-closed" },
			},
		];
		payload.store["verification-documents"] = [
			{
				id: "vd-open",
				request: "vr-open",
				shop: "s-1",
				kind: "rccm_extract",
				filename: "open.pdf",
				sha256: "h-open",
			},
			{
				id: "vd-closed",
				request: "vr-closed-shop",
				shop: "s-2",
				kind: "rccm_extract",
				filename: "closed.pdf",
				sha256: "h-closed",
			},
		];
		payload.store["webhook-events"] = [
			{
				id: "we-didit-1",
				provider: "didit",
				providerEventId: "evt-didit-1",
				reference: "sess-closed",
				providerReference: "sess-closed",
				payloadHash: "hash-didit-1",
				raw: {
					providerEventId: "evt-didit-1",
					type: "Approved",
					sessionRef: "sess-closed",
				},
			},
		];
		return payload;
	}

	it("keeps a decided request's identity hash but clears its names, and removes any still-open request", async () => {
		const payload = ownedShopWorldWithRequests();

		await deleteUserRelatedData(payload as never, { id: "u-1" });

		const decided = payload.store["verification-requests"].find(
			(r) => r.id === "vr-decided",
		);
		expect(decided?.kyc).toMatchObject({
			givenNames: null,
			familyName: null,
			documentNumberHash: "hash-a",
		});
		expect(
			payload.store["verification-requests"].some((r) => r.id === "vr-open"),
		).toBe(false);
	});

	it("purges a closed shop's documents too, not only an active shop's (I7)", async () => {
		const payload = ownedShopWorldWithRequests();

		await deleteUserRelatedData(payload as never, { id: "u-1" });

		const closedDoc = payload.store["verification-documents"].find(
			(d) => d.id === "vd-closed",
		);
		expect(closedDoc).toMatchObject({ filename: null });
		expect(closedDoc?.purgedAt).toBeTruthy();
	});

	it("deletes an open request's own documents instead of orphaning them (I7)", async () => {
		const payload = ownedShopWorldWithRequests();

		await deleteUserRelatedData(payload as never, { id: "u-1" });

		expect(
			payload.store["verification-documents"].some((d) => d.id === "vd-open"),
		).toBe(false);
	});

	it("removes the didit webhook-events row tied to the deleted account (I6)", async () => {
		const payload = ownedShopWorldWithRequests();

		await deleteUserRelatedData(payload as never, { id: "u-1" });

		expect(
			payload.store["webhook-events"].some((e) => e.id === "we-didit-1"),
		).toBe(false);
	});

	it("touches no other seller's documents when the deleted account owns no shop", async () => {
		const payload = world();
		payload.store.shops = [
			{ id: "s-other", handle: "other", status: "active", owner: "u-2" },
		];
		payload.store["verification-documents"] = [
			{
				id: "vd-other",
				request: "vr-other",
				shop: "s-other",
				kind: "rccm_extract",
				filename: "other.pdf",
				sha256: "h-other",
			},
		];

		await deleteUserRelatedData(payload as never, { id: "u-1" });

		expect(payload.store["verification-documents"][0]).toMatchObject({
			filename: "other.pdf",
		});
	});
});
