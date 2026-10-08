// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyRefundOverdue } from "../../src/services/caseNotifications";
import { advanceReturnRefunds } from "../../src/services/returnRefunds";
import { type Doc, fakePayload } from "./helpers/fakePayload";

vi.mock("../../src/services/caseNotifications", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../src/services/caseNotifications")
		>();
	return { ...actual, notifyRefundOverdue: vi.fn() };
});

const DAY = 86_400_000;
const REFUND_BY = new Date("2026-10-04T12:00:00.000Z");
const at = (days: number, extraMs = 0) =>
	new Date(REFUND_BY.getTime() + days * DAY + extraMs);

function world(
	refund: Doc,
	deadlines: Doc = { refundBy: REFUND_BY.toISOString() },
) {
	return fakePayload({
		orders: [
			{
				id: "order-1",
				orderNumber: "BNS-1",
				buyer: "buyer-1",
				shop: "shop-1",
				status: "delivered",
				paymentMethod: "cod",
				paymentStatus: "cod_collected",
				completionHold: "return_case",
				returnCase: "return-1",
			},
		],
		"return-cases": [
			{
				id: "return-1",
				number: "RET-1",
				basis: "withdrawal",
				order: "order-1",
				shop: "shop-1",
				buyer: "buyer-1",
				openedByType: "buyer",
				status: "refund_pending",
				deadlines,
				refund: { amount: 2_000, breakdown: { goods: 2_000 }, ...refund },
			},
		],
		"shop-strikes": [],
		"risk-signal-outbox": [],
		"order-events": [],
		"commission-lines": [],
		"payout-holds": [
			{
				id: "hold-1",
				scope: "order",
				shop: "shop-1",
				order: "order-1",
				reason: "return_open",
				status: "active",
			},
		],
	});
}

beforeEach(() => vi.mocked(notifyRefundOverdue).mockClear());

describe("handleRefundOverdue", () => {
	it("strikes, signals and notifies once at refundBy, however often the sweep runs", async () => {
		const payload = world({ channel: "seller_direct" });

		await advanceReturnRefunds(payload, at(0));
		await advanceReturnRefunds(payload, at(0));
		await advanceReturnRefunds(payload, at(0, 3_600_000));

		expect(payload.store["shop-strikes"]).toHaveLength(1);
		expect(payload.store["shop-strikes"]?.[0]).toMatchObject({
			shop: "shop-1",
			kind: "refund_overdue",
			weight: 2,
			sourceType: "return-case",
			sourceId: "return-1",
			status: "active",
		});
		expect(payload.store["risk-signal-outbox"]).toHaveLength(1);
		expect(payload.store["risk-signal-outbox"]?.[0]).toMatchObject({
			subjectType: "shop",
			subjectId: "shop-1",
			signal: "refund_overdue",
			severity: "high",
			sourceId: "return-1",
		});
		expect(notifyRefundOverdue).toHaveBeenCalledTimes(1);
	});

	it("does nothing before refundBy", async () => {
		const payload = world({ channel: "seller_direct" });

		await advanceReturnRefunds(payload, at(0, -1));

		expect(payload.store["shop-strikes"]).toHaveLength(0);
		expect(payload.store["risk-signal-outbox"]).toHaveLength(0);
		expect(notifyRefundOverdue).not.toHaveBeenCalled();
	});

	it("reminds every three days and not a moment sooner", async () => {
		const payload = world({ channel: "seller_direct" });
		await advanceReturnRefunds(payload, at(0));

		await advanceReturnRefunds(payload, at(3, -1));
		expect(notifyRefundOverdue).toHaveBeenCalledTimes(1);

		await advanceReturnRefunds(payload, at(3));
		await advanceReturnRefunds(payload, at(3));
		expect(notifyRefundOverdue).toHaveBeenCalledTimes(2);

		await advanceReturnRefunds(payload, at(6));
		expect(notifyRefundOverdue).toHaveBeenCalledTimes(3);
		expect(payload.store["shop-strikes"]).toHaveLength(1);
		expect(payload.store["risk-signal-outbox"]).toHaveLength(1);
	});

	it("raises the queue item once more thirty days past refundBy", async () => {
		const payload = world({ channel: "seller_direct" });
		await advanceReturnRefunds(payload, at(0));

		await advanceReturnRefunds(payload, at(30, -1));
		expect(payload.store["risk-signal-outbox"]).toHaveLength(1);

		await advanceReturnRefunds(payload, at(30));
		await advanceReturnRefunds(payload, at(30));
		expect(payload.store["risk-signal-outbox"]).toHaveLength(2);
		expect(payload.store["risk-signal-outbox"]?.[1]).toMatchObject({
			signal: "refund_overdue",
			severity: "high",
			sourceId: "return-1:escalated",
		});
		expect(payload.store["shop-strikes"]).toHaveLength(1);
	});

	it("leaves a case alone once the seller has filed proof, or when a provider refund is in flight", async () => {
		const proven = world({
			channel: "seller_direct",
			sellerProof: {
				method: "cash",
				amount: 2_000,
				evidence: "proof-1",
				submittedAt: at(-1).toISOString(),
			},
		});
		const provider = world({ channel: "provider", providerRefund: "refund-1" });

		await advanceReturnRefunds(proven, at(2));
		await advanceReturnRefunds(provider, at(2));

		for (const payload of [proven, provider]) {
			expect(payload.store["shop-strikes"]).toHaveLength(0);
			expect(payload.store["risk-signal-outbox"]).toHaveLength(0);
		}
		expect(notifyRefundOverdue).not.toHaveBeenCalled();
	});
});

describe("handleCodConfirmSilence", () => {
	const SUBMITTED = new Date("2026-10-10T09:00:00.000Z");
	const proof = (extra: Doc = {}) => ({
		channel: "seller_direct",
		sellerProof: {
			method: "mtn_momo",
			transactionId: "TX-1",
			amount: 2_000,
			evidence: "proof-1",
			submittedAt: SUBMITTED.toISOString(),
			...extra,
		},
	});
	const quiet = {
		refundBy: new Date(SUBMITTED.getTime() + 30 * DAY).toISOString(),
	};

	it("closes after seven days of buyer silence, releasing both holds, and not a moment sooner", async () => {
		const payload = world(proof(), quiet);

		const early = await advanceReturnRefunds(
			payload,
			new Date(SUBMITTED.getTime() + 7 * DAY - 1),
		);
		expect(early.closed).toEqual([]);
		expect(payload.store["return-cases"]?.[0]?.status).toBe("refund_pending");

		const due = await advanceReturnRefunds(
			payload,
			new Date(SUBMITTED.getTime() + 7 * DAY),
		);
		await advanceReturnRefunds(
			payload,
			new Date(SUBMITTED.getTime() + 8 * DAY),
		);

		expect(due.closed).toEqual(["return-1"]);
		expect(payload.store["return-cases"]?.[0]).toMatchObject({
			status: "closed",
			statusHistory: expect.arrayContaining([
				expect.objectContaining({ status: "closed", actorType: "system" }),
			]),
		});
		expect(payload.store.orders?.[0]).toMatchObject({
			completionHold: "none",
			returnCase: null,
		});
		expect(payload.store["payout-holds"]?.[0]?.status).toBe("released");
		expect(payload.store["shop-strikes"]).toHaveLength(0);
	});

	it("waits for a transaction id on a mobile-money proof, but not for a cash receipt", async () => {
		const noTransaction = world(proof({ transactionId: null }), quiet);
		const cash = world(proof({ method: "cash", transactionId: null }), quiet);
		const later = new Date(SUBMITTED.getTime() + 9 * DAY);

		await advanceReturnRefunds(noTransaction, later);
		await advanceReturnRefunds(cash, later);

		expect(noTransaction.store["return-cases"]?.[0]?.status).toBe(
			"refund_pending",
		);
		expect(cash.store["return-cases"]?.[0]?.status).toBe("closed");
	});

	it("does not close a contested refund", async () => {
		const payload = world(proof({}), quiet);
		payload.store["return-cases"]![0]!.refund = {
			...(payload.store["return-cases"]![0]!.refund as Doc),
			contestedAt: SUBMITTED.toISOString(),
		};

		await advanceReturnRefunds(
			payload,
			new Date(SUBMITTED.getTime() + 9 * DAY),
		);

		expect(payload.store["return-cases"]?.[0]?.status).toBe("refund_pending");
	});
});
