// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { processWebhookEventTask } from "../../src/jobs/processWebhookEvent";
import { NotchPayProvider } from "../../src/lib/payments/notchpay";
import {
	hashPayload,
	processWebhookEvent,
	recordWebhookEvent,
} from "../../src/services/webhookEvents";
import { fakePayload } from "./helpers/fakePayload";

const notchpay = new NotchPayProvider("pk", "https://notchpay.test", "hash");
const deps = { getProvider: () => notchpay };

const raw = {
	id: "evt_1",
	event: "payment.complete",
	data: {
		merchant_reference: "PI-pi-1",
		reference: "trx.1",
		amount: 900,
		currency: "XAF",
		status: "complete",
	},
};
const rawBody = JSON.stringify(raw);

/** The shape the provider actually sends: a customer object rides along. */
const rawWithCustomer = {
	...raw,
	id: "evt_2",
	data: {
		...raw.data,
		customer: {
			id: "cus_notch_1",
			email: "a@example.com",
			name: "Awa",
			phone: "+237600000001",
		},
	},
};

const DELETED_AT = "2026-09-15T10:00:00.000Z";

function deleteCustomer(payload: ReturnType<typeof world>) {
	const intent = payload.store["payment-intents"][0];
	intent.customer = null;
	intent.customerDeletedAt = DELETED_AT;
}

const recordWithCustomer = (payload: ReturnType<typeof world>) =>
	recordWebhookEvent(payload, {
		provider: "notchpay",
		event: notchpay.parseWebhookEvent(rawWithCustomer),
		raw: rawWithCustomer,
		rawBody: JSON.stringify(rawWithCustomer),
	});

function world() {
	return fakePayload(
		{
			listings: [{ id: "l-1", status: "published", boostedUntil: null }],
			"boost-payments": [
				{
					id: "bp-1",
					listing: "l-1",
					duration: "7",
					status: "pending",
					amount: 900,
				},
			],
			"payment-intents": [
				{
					id: "pi-1",
					purpose: "boost",
					targetId: "bp-1",
					amount: 900,
					currency: "XAF",
					status: "pending",
					reference: "PI-pi-1",
					providerReference: "trx.1",
					customer: "u-1",
					statusHistory: [],
				},
			],
		},
		{ uniques: { "webhook-events": [["provider", "providerEventId"]] } },
	);
}

const record = (payload: ReturnType<typeof world>) =>
	recordWebhookEvent(payload, {
		provider: "notchpay",
		event: notchpay.parseWebhookEvent(raw),
		raw,
		rawBody,
	});

describe("recordWebhookEvent", () => {
	it("stores the event once with its hash", async () => {
		const payload = world();
		const first = await record(payload);
		const second = await record(payload);

		expect(first.duplicate).toBe(false);
		expect(second).toEqual({ id: first.id, duplicate: true });
		expect(payload.store["webhook-events"]).toHaveLength(1);
		expect(payload.store["webhook-events"][0]).toMatchObject({
			provider: "notchpay",
			providerEventId: "evt_1",
			type: "payment.complete",
			reference: "PI-pi-1",
			providerReference: "trx.1",
			payloadHash: hashPayload(rawBody),
			attempts: 0,
		});
	});

	it("keys an event on the provider transaction id when the body carries no reference", async () => {
		const payload = world();
		const bare = {
			id: "evt_bare",
			event: "payment.complete",
			data: { reference: "trx.1", amount: 900, currency: "XAF" },
		};
		await recordWebhookEvent(payload, {
			provider: "notchpay",
			event: notchpay.parseWebhookEvent(bare),
			raw: bare,
			rawBody: JSON.stringify(bare),
		});

		expect(payload.store["webhook-events"][0]).toMatchObject({
			reference: undefined,
			providerReference: "trx.1",
		});
	});

	it("redacts a body that arrives after the customer's account is deleted", async () => {
		const payload = world();
		deleteCustomer(payload);

		await recordWithCustomer(payload);

		const stored = payload.store["webhook-events"][0];
		expect(stored.raw).toMatchObject({
			redacted: true,
			reference: "PI-pi-1",
			providerTransactionId: "trx.1",
		});
		const serialized = JSON.stringify(stored.raw);
		expect(serialized).not.toContain("a@example.com");
		expect(serialized).not.toContain("Awa");
		expect(serialized).not.toContain("+237600000001");
		expect(serialized).not.toContain("cus_notch_1");
	});

	it("keeps the provider body as sent while the customer still exists", async () => {
		const payload = world();
		await recordWithCustomer(payload);
		expect(JSON.stringify(payload.store["webhook-events"][0].raw)).toContain(
			"a@example.com",
		);
	});

	it("treats a lost insert race as a duplicate", async () => {
		const payload = world();
		const original = payload.create.bind(payload);
		vi.spyOn(payload, "create").mockImplementationOnce(async (args) => {
			await original(args);
			throw Object.assign(new Error("E11000"), { code: 11000 });
		});
		expect((await record(payload)).duplicate).toBe(true);
	});

	it("keys an event without an id by its payload hash", async () => {
		const payload = world();
		await recordWebhookEvent(payload, {
			provider: "notchpay",
			event: { ...notchpay.parseWebhookEvent(raw), providerEventId: "" },
			raw,
			rawBody,
		});
		expect(payload.store["webhook-events"][0].providerEventId).toBe(
			`sha256:${hashPayload(rawBody)}`,
		);
	});
});

describe("processWebhookEvent", () => {
	it("settles the intent and marks the event processed", async () => {
		const payload = world();
		const { id } = await record(payload);

		expect(await processWebhookEvent(payload, id, deps)).toEqual({
			outcome: "applied",
		});
		expect(payload.store["payment-intents"][0].status).toBe("succeeded");
		expect(payload.store["webhook-events"][0]).toMatchObject({
			attempts: 1,
			lastError: null,
		});
		expect(payload.store["webhook-events"][0].processedAt).toEqual(
			expect.any(String),
		);
	});

	it("redacts the stored body when the account is deleted between delivery and processing", async () => {
		const payload = world();
		const { id } = await recordWithCustomer(payload);
		deleteCustomer(payload);

		await processWebhookEvent(payload, id, deps);

		const stored = payload.store["webhook-events"][0];
		expect(stored.raw).toMatchObject({ redacted: true });
		expect(JSON.stringify(stored.raw)).not.toContain("a@example.com");
		expect(stored.processedAt).toEqual(expect.any(String));
	});

	it("does nothing for an event already processed", async () => {
		const payload = world();
		const { id } = await record(payload);
		await processWebhookEvent(payload, id, deps);
		expect(await processWebhookEvent(payload, id, deps)).toEqual({
			outcome: "already_processed",
		});
	});

	it("records the failure and rethrows so the job is retried", async () => {
		const payload = world();
		const { id } = await record(payload);
		vi.spyOn(payload, "findByID").mockImplementation(
			async ({ collection, id: docId }) => {
				if (collection === "payment-intents") throw new Error("mongo is down");
				return structuredClone(
					payload.store[collection].find(
						(doc) => String(doc.id) === String(docId),
					),
				);
			},
		);

		await expect(processWebhookEvent(payload, id, deps)).rejects.toThrow(
			"mongo is down",
		);
		expect(payload.store["webhook-events"][0]).toMatchObject({
			attempts: 1,
			lastError: "mongo is down",
		});
		expect(payload.store["webhook-events"][0].processedAt).toBeUndefined();
	});

	it("marks an unknown reference processed instead of retrying forever", async () => {
		const payload = fakePayload(
			{},
			{ uniques: { "webhook-events": [["provider", "providerEventId"]] } },
		);
		const { id } = await record(payload);

		expect(await processWebhookEvent(payload, id, deps)).toEqual({
			outcome: "unknown_reference",
		});
		expect(payload.logger.warn).toHaveBeenCalled();
		expect(payload.store["webhook-events"][0].processedAt).toEqual(
			expect.any(String),
		);
	});

	it("is retried up to five times with backoff", () => {
		expect(processWebhookEventTask.retries).toMatchObject({
			attempts: 5,
			backoff: { type: "exponential" },
		});
	});
});
