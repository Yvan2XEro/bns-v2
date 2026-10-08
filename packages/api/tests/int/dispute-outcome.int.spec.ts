// @vitest-environment node
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../src/lib/transactions";
import type { Dispute } from "../../src/payload-types";
import { applyOutcome } from "../../src/services/disputeOutcome";
import { adjustResellerCommission } from "../../src/services/purchaseOrders";
import { registerResaleAdjuster } from "../../src/lib/resale";
import { publishHeldReviews } from "../../src/services/reviewRelease";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-04T12:00:00.000Z");

function disputeFixture(): Dispute {
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
		paymentMethod: "cod",
		amountAtStake: 11_000,
		status: "under_review",
		statusHistory: [
			{ status: "open", actorType: "buyer" },
			{ status: "under_review", actorType: "seller" },
		],
		createdAt: "2026-10-04T10:00:00.000Z",
		updatedAt: "2026-10-04T10:00:00.000Z",
	};
}

function world() {
	return fakePayload({
		orders: [
			{
				id: "order-1",
				orderNumber: "BNS-1",
				buyer: "buyer-1",
				shop: "shop-1",
				status: "disputed",
				paymentMethod: "cod",
				paymentStatus: "cod_collected",
				completionHold: "dispute",
				activeDispute: "dispute-1",
				amounts: { subtotal: 10_000, deliveryFee: 1_000, total: 11_000 },
				timestamps: {
					shippedAt: "2026-09-30T12:00:00.000Z",
					deliveredAt: "2026-10-01T12:00:00.000Z",
				},
			},
		],
		"order-items": [
			{
				id: "item-1",
				order: "order-1",
				unitPrice: 10_000,
				quantity: 1,
				fulfillmentStatus: "delivered",
			},
		],
		"order-events": [],
		disputes: [
			{ ...disputeFixture(), items: [{ orderItem: "item-1", quantity: 1 }] },
		],
		"dispute-messages": [],
		"return-cases": [],
		"purchase-orders": [],
		"reseller-commissions": [],
		"payout-holds": [],
		"shop-strikes": [],
		"risk-signal-outbox": [],
		reviews: [
			{
				id: "review-1",
				order: "order-1",
				reviewer: "buyer-1",
				reviewedUser: "seller-1",
				rating: 2,
				status: "held_dispute",
			},
		],
		users: [{ id: "seller-1", rating: 0, totalReviews: 0 }],
	});
}

const buyerOutcome = {
	outcome: "resolved_buyer" as const,
	refundAmount: 11_000,
	returnRequired: false,
	returnShippingPaidBy: null,
	liableParty: "seller" as const,
	reasonCode: "item_not_conforming" as const,
	publicStatement: {
		fr: "Le remboursement est accordé.",
		en: "The refund is awarded.",
	},
};

describe("dispute outcome", () => {
	it("settles a COD decision once and hands a fully refunded delivered order back as returned", async () => {
		const payload = world();
		const dispute = disputeFixture();

		const first = await withTransaction(payload, (req) =>
			applyOutcome(req, dispute, buyerOutcome, "moderator", "staff-1", NOW),
		);
		const second = await withTransaction(payload, (req) =>
			applyOutcome(req, dispute, buyerOutcome, "moderator", "staff-1", NOW),
		);

		expect(first.status).toBe("resolved_buyer");
		expect(second.id).toBe(first.id);
		expect(payload.store.disputes).toHaveLength(1);
		expect(payload.store["return-cases"]).toHaveLength(1);
		expect(payload.store["return-cases"]?.[0]).toMatchObject({
			status: "refund_pending",
			refund: { channel: "seller_direct", amount: 11_000 },
		});
		expect(payload.store["shop-strikes"]).toHaveLength(1);
		expect(payload.store["risk-signal-outbox"]).toHaveLength(1);
		expect(payload.store["dispute-messages"]).toHaveLength(1);
		expect(payload.store.reviews?.[0]?.status).toBe("held_dispute");
		expect(payload.store.orders?.[0]).toMatchObject({
			status: "returned",
			completionHold: "return_case",
			activeDispute: null,
			paymentStatus: "cod_collected",
		});
	});

	it("publishes held reviews only after the 24-hour resolution window", async () => {
		const payload = world();
		const dispute = disputeFixture();
		await withTransaction(payload, (req) =>
			applyOutcome(req, dispute, buyerOutcome, "agreement", undefined, NOW),
		);

		const beforeDeadline = await publishHeldReviews(
			payload,
			new Date(NOW.getTime() + 23 * 60 * 60 * 1000),
		);
		expect(beforeDeadline).toHaveLength(0);
		expect(payload.store.reviews?.[0]?.status).toBe("held_dispute");

		const atDeadline = await publishHeldReviews(
			payload,
			new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
		);
		expect(atDeadline).toEqual(["review-1"]);
		expect(payload.store.reviews?.[0]?.status).toBe("published");
		expect(payload.store.users?.[0]).toMatchObject({
			rating: 2,
			totalReviews: 1,
		});
		await publishHeldReviews(
			payload,
			new Date(NOW.getTime() + 25 * 60 * 60 * 1000),
		);
		expect(payload.store.reviews?.[0]?.status).toBe("published");
		expect(payload.store.reviews).toHaveLength(1);
	});

	it("does not strike a seller when the parties settle before review", async () => {
		const payload = world();
		const dispute = disputeFixture();
		const beforeReview: Dispute = {
			...dispute,
			statusHistory: [{ status: "open", actorType: "buyer" }],
		};

		await withTransaction(payload, (req) =>
			applyOutcome(
				req,
				beforeReview,
				buyerOutcome,
				"agreement",
				undefined,
				NOW,
			),
		);

		expect(payload.store["shop-strikes"]).toHaveLength(0);
		expect(payload.store.disputes?.[0]?.status).toBe("resolved_buyer");
	});

	it("reduces the resale commission when a dispute refunds the buyer", async () => {
		const payload = world();
		payload.store["purchase-orders"]?.push({
			id: "po-1",
			order: "order-1",
			resellerShop: "shop-1",
			supplierShop: "supplier-1",
			resellerCommission: 1000,
			items: [{ orderItem: "item-1", resellerUnitPrice: 10_000, quantity: 1 }],
		});
		payload.store["reseller-commissions"]?.push({
			id: "commission-1",
			purchaseOrder: "po-1",
			resellerShop: "shop-1",
			supplierShop: "supplier-1",
			order: "order-1",
			amount: 1000,
			status: "accrued",
			holdReasons: [],
		});
		const unregister = registerResaleAdjuster({ adjustResellerCommission });
		try {
			await withTransaction(payload, (req) =>
				applyOutcome(req, disputeFixture(), buyerOutcome, "agreement", undefined, NOW),
			);
		} finally {
			unregister();
		}

		expect(payload.store["reseller-commissions"]?.[0]).toMatchObject({
			amount: 0,
			status: "cancelled",
			adjustments: [
				{ source: "dispute", sourceId: "dispute-1", delta: -1000 },
			],
		});
	});
});
