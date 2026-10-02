// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	activateBoostPayment,
	computeBoostedUntil,
	failBoostPayment,
} from "../../src/services/boostActivation";
import {
	applyStatus,
	createPaymentIntent,
	findIntentByIdempotencyKey,
	INTENT_TTL_MS,
	markIntentPending,
	settlePayment,
} from "../../src/services/payments";
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
			note: "the provider reported a different amount",
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

	it.each([
		"failed",
		"cancelled",
		"expired",
	] as const)("records but ignores a success reported on a %s intent", async (status) => {
		const payload = world({ status });
		const result = await settlePayment(payload, {
			...paid,
			source: "webhook",
		});

		expect(result.outcome).toBe("ignored");
		expect(intentOf(payload).status).toBe(status);
		expect(intentOf(payload).settledAmount).toBeUndefined();
		expect(intentOf(payload).statusHistory.at(-1)).toMatchObject({
			status: "succeeded",
			note: `ignored: intent is ${status}`,
		});
		expect(payload.logger.error).toHaveBeenCalled();
		expect(boostOf(payload).status).toBe("pending");
	});

	it("ignores a mismatched success reported on a closed intent", async () => {
		const payload = world({ status: "failed" });
		const result = await settlePayment(payload, {
			...paid,
			amount: 800,
			source: "webhook",
		});

		expect(result.outcome).toBe("ignored");
		expect(intentOf(payload).settledAmount).toBeUndefined();
		expect(intentOf(payload).settledCurrency).toBeUndefined();
	});

	it("settles an intent whose currency was written in lower case", async () => {
		const payload = world();
		const created = await createPaymentIntent(payload, {
			purpose: "boost",
			targetType: "boost-payment",
			targetId: "bp-1",
			customerId: "u-1",
			amount: 900,
			currency: "xaf",
			provider: "notchpay",
			idempotencyKey: "k-2",
		});
		const result = await settlePayment(payload, {
			...paid,
			reference: created.reference,
			providerTransactionId: "trx.2",
			source: "webhook",
		});

		expect(created.currency).toBe("XAF");
		expect(result.outcome).toBe("applied");
	});

	it("extends the boost once when a webhook and a callback race", async () => {
		const payload = world();
		const results = await Promise.all([
			settlePayment(payload, { ...paid, source: "webhook" }),
			settlePayment(payload, { ...paid, source: "callback" }),
		]);

		expect(results.map((r) => r.outcome).sort()).toEqual([
			"applied",
			"unchanged",
		]);
		expect(intentOf(payload).status).toBe("succeeded");
		expect(
			intentOf(payload).statusHistory.filter(
				(entry: { status: string }) => entry.status === "succeeded",
			),
		).toHaveLength(1);
		expect(listingOf(payload).boostedUntil).toBe(at(14 * DAY));
		expect(boostOf(payload).status).toBe("completed");
	});

	it("re-runs the boost failure when a failure is replayed", async () => {
		const payload = world();
		await settlePayment(payload, {
			...paid,
			status: "failed",
			source: "webhook",
		});
		// A crash between the two writes leaves the purchase behind; the next
		// report has to heal it.
		await payload.update({
			collection: "boost-payments",
			id: "bp-1",
			data: { status: "pending" },
		});

		const again = await settlePayment(payload, {
			...paid,
			status: "failed",
			source: "callback",
		});

		expect(again.outcome).toBe("unchanged");
		expect(boostOf(payload).status).toBe("failed");
	});
});

describe("createPaymentIntent", () => {
	it("creates a created intent with its own reference", async () => {
		const payload = world();
		const intent = await createPaymentIntent(payload, {
			purpose: "boost",
			targetType: "boost-payment",
			targetId: "bp-1",
			customerId: "u-1",
			amount: 900,
			currency: "xaf",
			provider: "notchpay",
			idempotencyKey: "k-2",
		});

		expect(intent).toMatchObject({
			status: "created",
			currency: "XAF",
			amount: 900,
			reference: `PI-${intent.id}`,
			expiresAt: at(INTENT_TTL_MS),
		});
		expect(intent.statusHistory).toEqual([
			{ status: "created", source: "system", at: NOW.toISOString() },
		]);
	});

	it.each([0, -1, 9.5])("refuses the amount %s", async (amount) => {
		const payload = world();
		await expect(
			createPaymentIntent(payload, {
				purpose: "boost",
				targetType: "boost-payment",
				targetId: "bp-1",
				customerId: "u-1",
				amount,
				currency: "XAF",
				provider: "notchpay",
				idempotencyKey: "k-3",
			}),
		).rejects.toThrow(/positive integer/);
		expect(payload.store["payment-intents"]).toHaveLength(1);
	});

	it("finds an intent back by its idempotency key", async () => {
		const payload = world();
		expect(await findIntentByIdempotencyKey(payload, "k-1")).toMatchObject({
			id: "pi-1",
		});
		expect(await findIntentByIdempotencyKey(payload, "nope")).toBeNull();
	});
});

describe("markIntentPending", () => {
	it("moves a created intent to pending with the provider details", async () => {
		const payload = world({ status: "created", providerReference: null });
		const intent = await markIntentPending(payload, "pi-1", {
			providerReference: "trx.9",
			checkoutUrl: "https://pay.test/9",
		});

		expect(intent).toMatchObject({
			status: "pending",
			providerReference: "trx.9",
			checkoutUrl: "https://pay.test/9",
		});
		expect(intent.statusHistory).toEqual([
			{ status: "pending", source: "system", at: NOW.toISOString() },
		]);
	});

	it("keeps the status when a fast webhook already settled the intent", async () => {
		const payload = world({ status: "succeeded" });
		const intent = await markIntentPending(payload, "pi-1", {
			providerReference: "trx.9",
			checkoutUrl: null,
		});

		expect(intent.status).toBe("succeeded");
		expect(intent.providerReference).toBe("trx.9");
		expect(intent.statusHistory).toEqual([]);
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

	it("heals an activation interrupted before the purchase was completed", async () => {
		const payload = world();
		const realUpdateOne = payload.db.updateOne;
		const crash = vi
			.spyOn(payload.db, "updateOne")
			.mockImplementation(async (args: { data: Record<string, unknown> }) => {
				if (args.data.status === "completed") throw new Error("crash");
				return realUpdateOne(args);
			});

		await expect(activateBoostPayment(payload, "bp-1")).rejects.toThrow(
			"crash",
		);
		expect(listingOf(payload).boostedUntil).toBe(at(14 * DAY));
		expect(boostOf(payload).status).toBe("pending");

		crash.mockRestore();
		const replay = await activateBoostPayment(payload, "bp-1");

		expect(replay).toEqual({ activated: true, boostedUntil: at(14 * DAY) });
		expect(listingOf(payload).boostedUntil).toBe(at(14 * DAY));
		expect(boostOf(payload).status).toBe("completed");
	});

	it("never fails a boost payment that does not exist", async () => {
		const payload = world();
		await expect(failBoostPayment(payload, "bp-nope")).rejects.toThrow(
			"Not Found",
		);
	});

	it("claims the purchase once when two activations interleave", async () => {
		const payload = world();
		const runs = await Promise.all([
			activateBoostPayment(payload, "bp-1"),
			activateBoostPayment(payload, "bp-1"),
		]);

		expect(runs.map((run) => run.activated).sort()).toEqual([false, true]);
		expect(listingOf(payload).boostedUntil).toBe(at(14 * DAY));
	});

	it("does nothing for a completed boost payment", async () => {
		const payload = world();
		expect((await activateBoostPayment(payload, "bp-1")).activated).toBe(true);
		expect((await activateBoostPayment(payload, "bp-1")).activated).toBe(false);
		expect(listingOf(payload).boostedUntil).toBe(at(14 * DAY));
	});
});

// Task 14: the `commission` purpose, wired into the same registry boost
// uses — `services/commission.ts` is never imported directly here, only
// through `settlePayment`/`PURPOSE_HANDLERS`, the same way a caller reaches
// it in production.
function commissionWorld(
	invoice: Record<string, unknown> = {},
	intent: Record<string, unknown> = {},
) {
	return fakePayload({
		shops: [
			{
				id: "s-1",
				name: "Shop",
				handle: "shop",
				owner: "u-1",
				status: "active",
			},
		],
		"commission-invoices": [
			{
				id: "inv-1",
				invoiceNumber: "BNS-C-2026-000001",
				shop: "s-1",
				status: "issued",
				totalDue: 4_293,
				...invoice,
			},
		],
		"payment-intents": [
			{
				id: "pi-1",
				purpose: "commission",
				targetType: "commission-invoice",
				targetId: "inv-1",
				customer: "u-1",
				amount: 4_293,
				currency: "XAF",
				provider: "notchpay",
				providerReference: "trx.c1",
				reference: "PI-pi-1",
				status: "pending",
				statusHistory: [],
				idempotencyKey: "commission:inv-1",
				...intent,
			},
		],
	});
}

const invoiceOf = (p: FakePayload) => p.store["commission-invoices"][0];

describe("commission settlement (PURPOSE_HANDLERS.commission)", () => {
	const paid = {
		reference: "PI-pi-1",
		status: "succeeded" as const,
		amount: 4_293,
		currency: "XAF",
		providerTransactionId: "trx.c1",
	};

	it("marks the invoice paid on a matching settlement", async () => {
		const payload = commissionWorld();
		const result = await settlePayment(payload, { ...paid, source: "webhook" });

		expect(result.outcome).toBe("applied");
		expect(invoiceOf(payload)).toMatchObject({ status: "paid" });
	});

	it("a settled amount different from totalDue leaves the intent pending and the invoice unpaid", async () => {
		const payload = commissionWorld();
		const result = await settlePayment(payload, {
			...paid,
			amount: 1_000, // the invoice's totalDue is 4 293
			source: "webhook",
		});

		expect(result.outcome).toBe("amount_mismatch");
		expect(payload.store["payment-intents"][0].status).toBe("pending");
		expect(invoiceOf(payload).status).toBe("issued");
	});

	it("ignores a duplicate commission settlement webhook", async () => {
		const payload = commissionWorld();
		await settlePayment(payload, { ...paid, source: "webhook" });
		const again = await settlePayment(payload, { ...paid, source: "callback" });

		expect(again.outcome).toBe("unchanged");
		expect(invoiceOf(payload).status).toBe("paid");
	});

	it("does nothing to the invoice on a failed commission payment", async () => {
		const payload = commissionWorld();
		await settlePayment(payload, {
			...paid,
			status: "failed",
			source: "webhook",
		});

		expect(invoiceOf(payload).status).toBe("issued");
	});
});
