// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTransaction } from "../../src/lib/transactions";
import type { Dispute } from "../../src/payload-types";
import { applyOutcome } from "../../src/services/disputeOutcome";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const DAY = 86_400_000;

function dispute(): Dispute {
	return {
		id: "dispute-1",
		number: "DSP-2610-000001",
		order: "order-1",
		shop: "shop-1",
		buyer: "buyer-1",
		subject: "goods",
		reason: "not_as_described",
		openedByType: "buyer",
		description: "The item did not match its listing description.",
		requestedOutcome: "full_refund",
		paymentMethod: "mobile_money",
		amountAtStake: 43_260,
		status: "under_review",
		statusHistory: [
			{ status: "open", actorType: "buyer" },
			{ status: "under_review", actorType: "seller" },
		],
		items: [{ orderItem: "item-1", quantity: 1 }],
		createdAt: "2026-10-04T10:00:00.000Z",
		updatedAt: "2026-10-04T10:00:00.000Z",
	} as Dispute;
}

function world(paidAt = NOW) {
	return fakePayload({
		orders: [
			{
				id: "order-1",
				orderNumber: "BNS-1",
				buyer: "buyer-1",
				shop: "shop-1",
				status: "disputed",
				paymentMethod: "mobile_money",
				paymentStatus: "paid",
				completionHold: "dispute",
				activeDispute: "dispute-1",
				delivery: { fee: 2_000 },
				amounts: {
					subtotal: 40_000,
					deliveryFee: 2_000,
					buyerProtectionFee: 1_260,
					total: 43_260,
					destinationAmount: 37_260,
					commission: 4_000,
					commissionVat: 740,
				},
				timestamps: {
					shippedAt: "2026-09-30T12:00:00.000Z",
					deliveredAt: "2026-10-01T12:00:00.000Z",
				},
				settlement: { refundedAmount: 0 },
			},
		],
		"payment-intents": [
			{
				id: "intent-1",
				purpose: "checkout",
				targetType: "order",
				targetId: "order-1",
				amount: 43_260,
				status: "succeeded",
				reference: "PAY-1",
				statusHistory: [
					{ status: "succeeded", source: "webhook", at: paidAt.toISOString() },
				],
			},
		],
		"order-items": [
			{ id: "item-1", order: "order-1", unitPrice: 40_000, quantity: 1 },
		],
		"order-events": [],
		disputes: [dispute()],
		"dispute-messages": [],
		"return-cases": [],
		"purchase-orders": [],
		"reseller-commissions": [],
		"shop-strikes": [],
		"risk-signal-outbox": [],
		refunds: [],
		"ledger-transactions": [],
		"ledger-accounts": [],
		reviews: [],
		"payout-holds": [
			{
				id: "hold-1",
				scope: "order",
				shop: "shop-1",
				order: "order-1",
				reason: "dispute_open",
				status: "active",
				blocksCharges: false,
			},
		],
	});
}

const statement = { fr: "Décision rendue.", en: "Decision made." };

const sellerWins = {
	outcome: "resolved_seller" as const,
	refundAmount: 0,
	returnRequired: false,
	returnShippingPaidBy: null,
	liableParty: "buyer" as const,
	reasonCode: "delivery_proven" as const,
	publicStatement: statement,
};

const buyerWinsWithReturn = {
	outcome: "resolved_buyer" as const,
	refundAmount: 43_260,
	returnRequired: true,
	returnShippingPaidBy: "seller" as const,
	liableParty: "seller" as const,
	reasonCode: "item_not_conforming" as const,
	publicStatement: statement,
};

const buyerWinsFull = { ...buyerWinsWithReturn, returnRequired: false };

afterEach(() => vi.useRealTimers());

const holdStatus = (payload: ReturnType<typeof world>) =>
	payload.store["payout-holds"]?.[0]?.status;

describe("the dispute_open hold at terminal resolution", () => {
	it("releases when the seller wins, and a rerun changes nothing", async () => {
		const payload = world();
		expect(holdStatus(payload)).toBe("active");

		const first = await withTransaction(payload, (req) =>
			applyOutcome(req, dispute(), sellerWins, "moderator", "staff-1", NOW),
		);
		const second = await withTransaction(payload, (req) =>
			applyOutcome(req, dispute(), sellerWins, "moderator", "staff-1", NOW),
		);

		expect(holdStatus(payload)).toBe("released");
		expect(first.effects?.holdsReleased).toBe(true);
		expect(second.id).toBe(first.id);
		expect(payload.store["payout-holds"]).toHaveLength(1);
	});

	it("releases when the buyer wins and the refund waits on a return", async () => {
		const payload = world();

		const resolved = await withTransaction(payload, (req) =>
			applyOutcome(
				req,
				dispute(),
				buyerWinsWithReturn,
				"moderator",
				"staff-1",
				NOW,
			),
		);

		expect(payload.store.refunds).toHaveLength(0);
		expect(holdStatus(payload)).toBe("released");
		expect(resolved.effects?.holdsReleased).toBe(true);
	});

	it("releases when an expired provider window flips the refund to the seller", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		const payload = world(new Date(NOW.getTime() - 86 * DAY));

		const resolved = await withTransaction(payload, (req) =>
			applyOutcome(req, dispute(), buyerWinsFull, "moderator", "staff-1", NOW),
		);

		expect(payload.store.refunds).toHaveLength(0);
		expect(payload.store["return-cases"]?.[0]).toMatchObject({
			refund: { channel: "seller_direct" },
		});
		expect(holdStatus(payload)).toBe("released");
		expect(resolved.effects?.holdsReleased).toBe(true);
	});
});

describe("the stored refund breakdown", () => {
	it("carries the protection fee on a full protected refund, in the case and the resolution", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		const payload = world();

		const resolved = await withTransaction(payload, (req) =>
			applyOutcome(req, dispute(), buyerWinsFull, "moderator", "staff-1", NOW),
		);

		const whole = {
			goods: 40_000,
			outboundDelivery: 2_000,
			returnShipping: 0,
			buyerProtectionFee: 1_260,
			deduction: 0,
		};
		expect(payload.store.refunds).toHaveLength(1);
		expect(payload.store.refunds?.[0]?.amount).toBe(43_260);
		expect(payload.store["return-cases"]?.[0]).toMatchObject({
			refund: { breakdown: whole },
		});
		expect(resolved.resolution?.breakdown).toEqual(whole);
	});

	it.each([
		[10_000, 10_000, 0, 0],
		[41_000, 40_000, 1_000, 0],
		[43_260, 40_000, 2_000, 1_260],
	])("sums to the refund amount for %i", async (amount, goods, outbound, fee) => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		const payload = world();
		const outcome =
			amount === 43_260
				? buyerWinsFull
				: {
						...buyerWinsFull,
						outcome: "resolved_split" as const,
						refundAmount: amount,
					};

		const resolved = await withTransaction(payload, (req) =>
			applyOutcome(req, dispute(), outcome, "moderator", "staff-1", NOW),
		);

		const b = resolved.resolution?.breakdown;
		expect(b).toEqual({
			goods,
			outboundDelivery: outbound,
			returnShipping: 0,
			buyerProtectionFee: fee,
			deduction: 0,
		});
		expect(
			(b?.goods ?? 0) +
				(b?.outboundDelivery ?? 0) +
				(b?.returnShipping ?? 0) +
				(b?.buyerProtectionFee ?? 0) -
				(b?.deduction ?? 0),
		).toBe(amount);
	});
});
