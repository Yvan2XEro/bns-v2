// @vitest-environment node
import type { PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashDeliveryPhone } from "../../src/lib/phoneHash";
import {
	recordCancelAfterAccept,
	recordDelivered,
	recordPlacement,
	recordRefusal,
	scoreCheckout,
	tierFor,
} from "../../src/services/orders/risk";
import { normalizePhoneNumber } from "../../src/services/phoneVerification";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

const PEPPER = "test-pepper";
const now = new Date("2026-10-02T12:00:00.000Z");

/** The real hash a correctly-normalised phone resolves to — computed with
 * the exact same two functions `risk.ts` composes, never duplicated by hand. */
const hashOf = (e164: string) =>
	hashDeliveryPhone(PEPPER, normalizePhoneNumber(e164));

function seed(): FakePayload {
	return fakePayload(
		{ "buyer-phone-scores": [] },
		{ uniques: { "buyer-phone-scores": [["phoneHash"]] } },
	);
}

/** `fakePayload`'s return is already cast to satisfy `Payload`; `req` only
 * needs the subset `risk.ts` reads (`.payload`, `.context`, `.transactionID`). */
function fakeReq(
	payload: FakePayload,
	overrides: { transactionID?: string } = {},
): PayloadRequest {
	return {
		payload,
		context: {},
		...overrides,
	} as unknown as PayloadRequest;
}

function row(payload: FakePayload) {
	return payload.store["buyer-phone-scores"]?.[0];
}

/** `payload.db.beginTransaction` is typed for every adapter's id shape;
 * the fake's is always a string, which this confirms rather than assumes. */
async function beginTx(payload: FakePayload): Promise<string> {
	const id = await payload.db.beginTransaction();
	if (typeof id !== "string")
		throw new Error("expected a string transaction id");
	return id;
}

beforeEach(() => {
	process.env.ORDER_PHONE_PEPPER = PEPPER;
});

afterEach(() => {
	process.env.ORDER_PHONE_PEPPER = undefined;
});

describe("scoreCheckout", () => {
	it("scores the delivery phone and the account phone and keeps the worse tier", async () => {
		const payload = seed();
		const req = fakeReq(payload);
		// Account phone: three refusals, no deliveries -> blocked (3/3 = 1.0).
		await recordRefusal(req, {
			phone: "+237600000001",
			orderId: "a-1",
			reason: "refused",
		});
		await recordRefusal(req, {
			phone: "+237600000001",
			orderId: "a-2",
			reason: "refused",
		});
		await recordRefusal(req, {
			phone: "+237600000001",
			orderId: "a-3",
			reason: "refused",
		});
		// Delivery phone: three clean deliveries -> trusted.
		await recordDelivered(req, { phone: "+237600000002", orderId: "d-1" });
		await recordDelivered(req, { phone: "+237600000002", orderId: "d-2" });
		await recordDelivered(req, { phone: "+237600000002", orderId: "d-3" });

		const result = await scoreCheckout(
			payload,
			{ accountPhone: "+237600000001", deliveryPhone: "+237600000002" },
			now,
		);

		// The delivery phone alone reads "trusted"; only the worse (account)
		// phone's "blocked" explains this result.
		expect(result.tier).toBe("blocked");
		expect(result.refusals).toBe(0); // the delivery phone's own refusal count
		expect(result.deliveryPhoneHash).toBe(hashOf("+237600000002"));
	});

	it("treats a fresh account on a scored phone as not a fresh buyer", async () => {
		const payload = seed();
		const req = fakeReq(payload);
		// This number has a blocked history, however it got there.
		await recordRefusal(req, {
			phone: "+237611111111",
			orderId: "x-1",
			reason: "refused",
		});
		await recordRefusal(req, {
			phone: "+237611111111",
			orderId: "x-2",
			reason: "refused",
		});
		await recordRefusal(req, {
			phone: "+237611111111",
			orderId: "x-3",
			reason: "refused",
		});

		// A brand-new account, verified phone never seen before, now checks out
		// with that same number as the delivery phone.
		const result = await scoreCheckout(
			payload,
			{ accountPhone: "+237699999999", deliveryPhone: "+237611111111" },
			now,
		);

		expect(result.tier).toBe("blocked");
	});
});

describe("tierFor", () => {
	it("treats a phone with no row as new", async () => {
		const payload = seed();
		expect(await tierFor(payload, "+237600099999", now)).toBe("new");
	});
});

describe("recordPlacement", () => {
	it("never stores the number itself", async () => {
		const payload = seed();
		await recordPlacement(fakeReq(payload), {
			phone: "+237655512345",
			orderId: "o-1",
		});

		const stored = row(payload);
		expect(stored).toBeDefined();
		expect(stored?.phoneHash).toBeTruthy();
		const values = Object.values(stored ?? {});
		expect(
			values.some((v) => typeof v === "string" && v.includes("55512345")),
		).toBe(false);
		expect(Object.keys(stored ?? {})).not.toContain("phone");
	});

	it("normalises before hashing, so all three phone shapes reach the same row", async () => {
		const payload = seed();
		const req = fakeReq(payload);
		await recordPlacement(req, { phone: "237600000001", orderId: "p-1" });
		await recordPlacement(req, { phone: "+237 600 000 001", orderId: "p-2" });
		await recordPlacement(req, { phone: "00237600000001", orderId: "p-3" });

		expect(payload.store["buyer-phone-scores"]).toHaveLength(1);
		expect(row(payload)?.ordersPlaced).toBe(3);
		expect(row(payload)?.phoneHash).toBe(hashOf("+237600000001"));
	});

	it("lets a staff blockedOverride survive a recompute", async () => {
		const payload = seed();
		const phoneHash = hashOf("+237677712345");
		await payload.create({
			collection: "buyer-phone-scores",
			data: {
				phoneHash,
				ordersPlaced: 0,
				ordersDelivered: 9,
				refusals: [],
				cancelledAfterAccept: 0,
				blockedOverride: "blocked",
				tier: "blocked",
			},
		});

		await recordPlacement(fakeReq(payload), {
			phone: "+237677712345",
			orderId: "o-9",
		});

		const stored = row(payload);
		expect(stored?.blockedOverride).toBe("blocked");
		expect(stored?.tier).toBe("blocked");
	});
});

describe("recordDelivered", () => {
	it("increments ordersDelivered once for a replayed delivery", async () => {
		const payload = seed();
		const phone = "+237644400001";

		const tx1 = await beginTx(payload);
		await recordDelivered(fakeReq(payload, { transactionID: tx1 }), {
			phone,
			orderId: "r-1",
		});
		// The handler crashed before committing; the caller retries from scratch.
		await payload.db.rollbackTransaction(tx1);

		const tx2 = await beginTx(payload);
		await recordDelivered(fakeReq(payload, { transactionID: tx2 }), {
			phone,
			orderId: "r-1",
		});
		await payload.db.commitTransaction(tx2);

		expect(row(payload)?.ordersDelivered).toBe(1);
	});
});

describe("recordRefusal and recomputed tiers", () => {
	it("keeps the last twenty refusals and drops the twenty-first", async () => {
		const payload = seed();
		const req = fakeReq(payload);
		const phone = "+237655500002";
		for (let i = 1; i <= 21; i += 1) {
			await recordRefusal(req, { phone, orderId: `f-${i}`, reason: "refused" });
		}

		const refusals = row(payload)?.refusals as Array<{ order: string }>;
		expect(refusals).toHaveLength(20);
		expect(refusals.map((r) => r.order)).not.toContain("f-1");
		expect(refusals.map((r) => r.order)).toContain("f-21");
	});

	it("recomputes the tier on every change: three refusals against three deliveries lands on blocked", async () => {
		const payload = seed();
		const req = fakeReq(payload);
		const phone = "+237655500003";
		await recordDelivered(req, { phone, orderId: "g-d1" });
		await recordDelivered(req, { phone, orderId: "g-d2" });
		await recordDelivered(req, { phone, orderId: "g-d3" });
		await recordRefusal(req, { phone, orderId: "g-r1", reason: "refused" });
		await recordRefusal(req, { phone, orderId: "g-r2", reason: "refused" });
		await recordRefusal(req, { phone, orderId: "g-r3", reason: "refused" });

		expect(row(payload)?.tier).toBe("blocked");
	});

	it("records a refusal only for the three buyer-fault reasons: timeout leaves refusals untouched", async () => {
		const payload = seed();
		await recordRefusal(fakeReq(payload), {
			phone: "+237655500004",
			orderId: "t-1",
			reason: "timeout",
		});

		expect(payload.store["buyer-phone-scores"]).toHaveLength(0);
	});

	it("does not count the same order's refusal twice", async () => {
		const payload = seed();
		const req = fakeReq(payload);
		const phone = "+237655500005";
		await recordRefusal(req, { phone, orderId: "dup-1", reason: "refused" });
		await recordRefusal(req, { phone, orderId: "dup-1", reason: "refused" });

		expect(row(payload)?.refusals).toHaveLength(1);
		expect(row(payload)?.ordersDelivered).toBe(0);
	});
});

describe("recordCancelAfterAccept", () => {
	it("increments cancelledAfterAccept", async () => {
		const payload = seed();
		await recordCancelAfterAccept(fakeReq(payload), {
			phone: "+237655500006",
			orderId: "c-1",
		});

		expect(row(payload)?.cancelledAfterAccept).toBe(1);
	});
});
