// @vitest-environment node
import { describe, expect, it } from "vitest";
import { backfillBoostPaymentIntents } from "../../src/services/paymentBackfill";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T10:00:00.000Z");
const hoursAgo = (h: number) =>
	new Date(NOW.getTime() - h * 3_600_000).toISOString();

const legacy = (id: string, status: string, createdAt = hoursAgo(48)) => ({
	id,
	listing: "l-1",
	user: "u-1",
	amount: 900,
	duration: "14",
	status,
	paymentProvider: "notchpay",
	paymentReference: `trx.${id}`,
	paymentUrl: `https://pay.test/${id}`,
	createdAt,
	updatedAt: createdAt,
});

function fixture() {
	return fakePayload({
		"boost-payments": [
			legacy("bp-done", "completed"),
			legacy("bp-failed", "failed"),
			legacy("bp-refunded", "refunded"),
			legacy("bp-stale", "pending", hoursAgo(30)),
			legacy("bp-fresh", "pending", hoursAgo(2)),
			{ ...legacy("bp-linked", "completed"), paymentIntent: "pi-existing" },
			legacy("bp-half", "completed"),
		],
		"payment-intents": [
			{ id: "pi-existing", reference: "PI-pi-existing", status: "succeeded" },
			{ id: "pi-half", reference: "BOOST-bp-half", status: "succeeded" },
		],
	});
}

const intentFor = (payload: ReturnType<typeof fixture>, boostId: string) =>
	payload.store["payment-intents"].find(
		(i) => i.reference === `BOOST-${boostId}`,
	);

describe("backfillBoostPaymentIntents", () => {
	it("creates one intent per unlinked boost payment with the mapped status", async () => {
		const payload = fixture();
		const result = await backfillBoostPaymentIntents(payload, { now: NOW });

		expect(result).toEqual({ created: 5, linked: 6 });
		expect(intentFor(payload, "bp-done")).toMatchObject({
			purpose: "boost",
			targetType: "boost-payment",
			targetId: "bp-done",
			customer: "u-1",
			amount: 900,
			currency: "XAF",
			provider: "notchpay",
			providerReference: "trx.bp-done",
			status: "succeeded",
			settledAmount: 900,
			idempotencyKey: "legacy:bp-done",
		});
		expect(intentFor(payload, "bp-failed")?.status).toBe("failed");
		expect(intentFor(payload, "bp-refunded")?.status).toBe("succeeded");
		expect(intentFor(payload, "bp-refunded")?.statusHistory[0].note).toContain(
			"refunded",
		);
		expect(intentFor(payload, "bp-stale")?.status).toBe("expired");
		expect(intentFor(payload, "bp-fresh")?.status).toBe("pending");
	});

	it("marks a stale pending boost payment failed to mirror its expired intent", async () => {
		const payload = fixture();
		await backfillBoostPaymentIntents(payload, { now: NOW });
		const stale = payload.store["boost-payments"].find(
			(b) => b.id === "bp-stale",
		);
		expect(stale?.status).toBe("failed");
	});

	it("links an intent left by an interrupted run instead of creating another", async () => {
		const payload = fixture();
		await backfillBoostPaymentIntents(payload, { now: NOW });
		const half = payload.store["boost-payments"].find(
			(b) => b.id === "bp-half",
		);
		expect(half?.paymentIntent).toBe("pi-half");
		expect(
			payload.store["payment-intents"].filter(
				(i) => i.reference === "BOOST-bp-half",
			),
		).toHaveLength(1);
	});

	it("changes nothing on a second run", async () => {
		const payload = fixture();
		await backfillBoostPaymentIntents(payload, { now: NOW });
		const snapshot = structuredClone(payload.store);

		const second = await backfillBoostPaymentIntents(payload, { now: NOW });

		expect(second).toEqual({ created: 0, linked: 0 });
		expect(payload.store).toEqual(snapshot);
	});
});
