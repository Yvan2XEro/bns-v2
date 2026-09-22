// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	activateBoostPayment,
	computeBoostedUntil,
} from "../../src/services/boostActivation";
import { applyStatus, settlePayment } from "../../src/services/payments";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T10:00:00.000Z");
const DAY = 86_400_000;
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

function world(
	intent: Record<string, unknown> = {},
	listing: Record<string, unknown> = {},
) {
	return fakePayload({
		listings: [
			{
				id: "l-1",
				seller: "u-1",
				status: "published",
				boostedUntil: null,
				...listing,
			},
		],
		"boost-payments": [
			{
				id: "bp-1",
				listing: "l-1",
				user: "u-1",
				amount: 900,
				duration: "14",
				status: "pending",
				paymentProvider: "notchpay",
				paymentIntent: "pi-1",
			},
		],
		"payment-intents": [
			{
				id: "pi-1",
				purpose: "boost",
				targetType: "boost-payment",
				targetId: "bp-1",
				customer: "u-1",
				amount: 900,
				currency: "XAF",
				provider: "notchpay",
				providerReference: "trx.1",
				reference: "PI-pi-1",
				status: "pending",
				statusHistory: [],
				idempotencyKey: "k-1",
				...intent,
			},
		],
	});
}

const paid = {
	reference: "PI-pi-1",
	status: "succeeded" as const,
	amount: 900,
	currency: "XAF",
	providerTransactionId: "trx.1",
};
const intentOf = (p: FakePayload) => p.store["payment-intents"][0];
const boostOf = (p: FakePayload) => p.store["boost-payments"][0];
const listingOf = (p: FakePayload) => p.store.listings[0];

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("settlePayment", () => {
	it("settles a matching success and boosts the listing", async () => {
		const payload = world();
		const result = await settlePayment(payload, { ...paid, source: "webhook" });

		expect(result.outcome).toBe("applied");
		expect(intentOf(payload)).toMatchObject({
			status: "succeeded",
			settledAmount: 900,
			settledCurrency: "XAF",
		});
		expect(intentOf(payload).statusHistory.at(-1)).toMatchObject({
			status: "succeeded",
			source: "webhook",
		});
		expect(boostOf(payload).status).toBe("completed");
		expect(listingOf(payload).boostedUntil).toBe(at(14 * DAY));
	});

	it.each([
		["amount", { amount: 800 }],
		["currency", { currency: "EUR" }],
		["missing amount", { amount: null }],
	])("keeps the intent pending on a %s mismatch", async (_label, change) => {
		const payload = world();
		const result = await settlePayment(payload, {
			...paid,
			...change,
			source: "webhook",
		});

		expect(result.outcome).toBe("amount_mismatch");
		expect(intentOf(payload).status).toBe("pending");
		expect(intentOf(payload).statusHistory.at(-1)).toMatchObject({
			status: "succeeded",
			note: "payment.amountMismatch",
		});
		expect(boostOf(payload).status).toBe("pending");
		expect(listingOf(payload).boostedUntil).toBeNull();
		expect(payload.logger.error).toHaveBeenCalled();
	});

	it("ignores a duplicate webhook", async () => {
		const payload = world();
		await settlePayment(payload, { ...paid, source: "webhook" });
		const boosted = listingOf(payload).boostedUntil;
		const historyLength = intentOf(payload).statusHistory.length;

		const again = await settlePayment(payload, { ...paid, source: "webhook" });

		expect(again.outcome).toBe("unchanged");
		expect(listingOf(payload).boostedUntil).toBe(boosted);
		expect(intentOf(payload).statusHistory).toHaveLength(historyLength);
	});

	it.each([
		["webhook then callback", "webhook", "callback"],
		["callback then webhook", "callback", "webhook"],
	] as const)("reaches the same state for %s", async (_label, first, second) => {
		const payload = world();
		await settlePayment(payload, { ...paid, source: first });
		await settlePayment(payload, { ...paid, source: second });

		expect(intentOf(payload).status).toBe("succeeded");
		expect(
			intentOf(payload).statusHistory.filter(
				(entry: { status: string }) => entry.status === "succeeded",
			),
		).toHaveLength(1);
		expect(listingOf(payload).boostedUntil).toBe(at(14 * DAY));
	});

	it("records but ignores a failure after a success", async () => {
		const payload = world();
		await settlePayment(payload, { ...paid, source: "webhook" });
		const result = await settlePayment(payload, {
			...paid,
			status: "failed",
			source: "webhook",
		});

		expect(result.outcome).toBe("ignored");
		expect(intentOf(payload).status).toBe("succeeded");
		expect(intentOf(payload).statusHistory.at(-1)).toMatchObject({
			status: "failed",
			note: "ignored: intent is succeeded",
		});
		expect(boostOf(payload).status).toBe("completed");
	});

	it("fails the boost payment when the intent fails", async () => {
		const payload = world();
		await settlePayment(payload, {
			...paid,
			status: "failed",
			source: "webhook",
		});

		expect(intentOf(payload).status).toBe("failed");
		expect(boostOf(payload).status).toBe("failed");
	});

	it("walks a created intent through pending", async () => {
		const payload = world({ status: "created" });
		await settlePayment(payload, { ...paid, source: "webhook" });

		expect(
			intentOf(payload).statusHistory.map((e: { status: string }) => e.status),
		).toEqual(["pending", "succeeded"]);
	});

	it("resolves a legacy BOOST- reference", async () => {
		const payload = world({ id: "pi-9", reference: "BOOST-bp-1" });
		const result = await settlePayment(payload, {
			...paid,
			reference: "BOOST-bp-1",
			source: "webhook",
		});
		expect(result.outcome).toBe("applied");
	});

	it("falls back to the provider transaction id", async () => {
		const payload = world();
		const result = await settlePayment(payload, {
			...paid,
			reference: "",
			source: "callback",
		});
		expect(result.outcome).toBe("applied");
	});

	it("reports an unknown reference without writing anything", async () => {
		const payload = world();
		const result = await settlePayment(payload, {
			...paid,
			reference: "PI-nope",
			providerTransactionId: "trx.nope",
			source: "webhook",
		});
		expect(result.outcome).toBe("unknown_reference");
		expect(intentOf(payload).status).toBe("pending");
	});
});

describe("applyStatus", () => {
	it("expires a pending intent and fails its boost payment", async () => {
		const payload = world();
		const result = await applyStatus(payload, "pi-1", {
			status: "expired",
			source: "reconcile",
		});
		expect(result.outcome).toBe("applied");
		expect(boostOf(payload).status).toBe("failed");
	});
});

describe("boost activation", () => {
	it("extends a boost that is still running", async () => {
		const payload = world({}, { boostedUntil: at(3 * DAY) });
		await settlePayment(payload, { ...paid, source: "webhook" });
		expect(listingOf(payload).boostedUntil).toBe(at(17 * DAY));
	});

	it("starts from now when the previous boost is over", () => {
		expect(computeBoostedUntil(at(-DAY), NOW, 7)).toBe(at(7 * DAY));
		expect(computeBoostedUntil(null, NOW, 7)).toBe(at(7 * DAY));
		expect(computeBoostedUntil("not a date", NOW, 7)).toBe(at(7 * DAY));
	});

	it("does nothing for a completed boost payment", async () => {
		const payload = world();
		expect((await activateBoostPayment(payload, "bp-1")).activated).toBe(true);
		expect((await activateBoostPayment(payload, "bp-1")).activated).toBe(false);
		expect(listingOf(payload).boostedUntil).toBe(at(14 * DAY));
	});
});
