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
			payloadHash: hashPayload(rawBody),
			attempts: 0,
		});
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
