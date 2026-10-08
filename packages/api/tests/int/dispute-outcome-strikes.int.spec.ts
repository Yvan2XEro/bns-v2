// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countRefusals } from "../../src/lib/buyerRisk";
import { withTransaction } from "../../src/lib/transactions";
import type { Dispute } from "../../src/payload-types";
import { applyOutcome } from "../../src/services/disputeOutcome";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const statement = { fr: "Décision rendue.", en: "Decision made." };

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	process.env.ORDER_PHONE_PEPPER = "test-pepper";
});
afterEach(() => {
	vi.useRealTimers();
	process.env.ORDER_PHONE_PEPPER = undefined;
});

function dispute(overrides: Partial<Dispute> = {}): Dispute {
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
		items: [{ orderItem: "item-1", quantity: 1 }],
		createdAt: "2026-10-04T10:00:00.000Z",
		updatedAt: "2026-10-04T10:00:00.000Z",
		...overrides,
	} as Dispute;
}

function world(disputeDoc: Dispute = dispute()) {
	return fakePayload({
		orders: [
			{
				id: "order-1",
				orderNumber: "BNS-1",
				buyer: "buyer-1",
				shop: "shop-1",
				status: "disputed",
				paymentMethod: "cod",
				paymentStatus: "cod_pending",
				completionHold: "dispute",
				activeDispute: "dispute-1",
				delivery: { fee: 1_000, phone: "+237670000001" },
				amounts: { subtotal: 10_000, deliveryFee: 1_000, total: 11_000 },
				timestamps: { shippedAt: "2026-09-30T12:00:00.000Z" },
			},
		],
		"order-items": [{ id: "item-1", order: "order-1", quantity: 1 }],
		"order-events": [],
		disputes: [disputeDoc],
		"dispute-messages": [],
		"return-cases": [],
		"purchase-orders": [],
		"reseller-commissions": [],
		"payout-holds": [],
		"shop-strikes": [],
		"risk-signal-outbox": [],
		"buyer-phone-scores": [],
		reviews: [
			{
				id: "review-1",
				order: "order-1",
				reviewer: "buyer-1",
				reviewedUser: "seller-1",
				rating: 1,
				status: "held_dispute",
				verifiedPurchase: true,
			},
			{
				id: "review-2",
				order: "order-9",
				reviewer: "buyer-1",
				reviewedUser: "seller-1",
				rating: 5,
				status: "published",
				verifiedPurchase: true,
			},
		],
		users: [{ id: "seller-1", rating: 0, totalReviews: 0 }],
	});
}

const outcome = (overrides: Record<string, unknown> = {}) => ({
	outcome: "resolved_buyer" as const,
	refundAmount: 11_000,
	returnRequired: false,
	returnShippingPaidBy: null,
	liableParty: "seller" as const,
	reasonCode: "item_not_conforming" as const,
	publicStatement: statement,
	...overrides,
});

const run = (
	payload: ReturnType<typeof world>,
	input: ReturnType<typeof outcome>,
	by: "system" | "agreement" | "moderator",
	disputeDoc: Dispute = dispute(),
) =>
	withTransaction(payload, (req) =>
		applyOutcome(
			req,
			disputeDoc,
			input,
			by,
			by === "moderator" ? "staff-1" : undefined,
			NOW,
		),
	);

describe("strikes beyond a moderator's resolved_buyer", () => {
	it("strikes once on a silence-default resolved_buyer, keeping the low signal", async () => {
		const payload = world();
		const silent = dispute({
			status: "awaiting_seller",
			statusHistory: [{ status: "open", actorType: "buyer" }],
		});

		await run(
			payload,
			outcome({ reasonCode: "seller_no_proof" }),
			"system",
			silent,
		);
		await run(
			payload,
			outcome({ reasonCode: "seller_no_proof" }),
			"system",
			silent,
		);

		expect(payload.store["shop-strikes"]).toHaveLength(1);
		expect(payload.store["shop-strikes"]?.[0]).toMatchObject({
			shop: "shop-1",
			kind: "dispute_lost",
			weight: 1,
			sourceType: "dispute",
			sourceId: "dispute-1",
		});
		expect(
			payload.store["risk-signal-outbox"]?.map((s) => [s.signal, s.severity]),
		).toEqual([["seller_no_response", "low"]]);
	});

	it.each([
		["item_not_conforming", 1],
		["seller_no_proof", 1],
		["partial_fault", 0],
		["damage_in_transit", 0],
	] as const)("a moderator's split for %s writes %i strike(s)", async (reasonCode, strikes) => {
		const payload = world();

		await run(
			payload,
			outcome({ outcome: "resolved_split", refundAmount: 5_000, reasonCode }),
			"moderator",
		);

		expect(payload.store["shop-strikes"]).toHaveLength(strikes);
		expect(payload.store.disputes?.[0]?.status).toBe("resolved_split");
	});

	it("never strikes a split agreed between the parties", async () => {
		const payload = world();

		await run(
			payload,
			outcome({ outcome: "resolved_split", refundAmount: 5_000 }),
			"agreement",
		);

		expect(payload.store["shop-strikes"]).toHaveLength(0);
	});
});

describe("cod_refused_abuse resolved for the seller", () => {
	const abuse = () =>
		dispute({ reason: "cod_refused_abuse", subject: "goods" });
	const sellerWins = () =>
		outcome({
			outcome: "resolved_seller",
			refundAmount: 0,
			reasonCode: "delivery_proven",
			liableParty: "buyer",
		});

	it("adds 2 to the buyer's refusal score, strips the verified flag and signals the phone", async () => {
		const payload = world(abuse());

		await run(payload, sellerWins(), "moderator", abuse());
		await run(payload, sellerWins(), "moderator", abuse());

		const [row] = payload.store["buyer-phone-scores"] ?? [];
		expect(row?.refusals).toEqual([
			{ order: "order-1", reason: "refused_abuse", at: NOW.toISOString() },
		]);
		expect(
			countRefusals(
				(row?.refusals as { reason: string; at: string }[]) ?? [],
				NOW,
			),
		).toBe(2);
		expect(
			payload.store.reviews?.map((r) => [r.id, r.verifiedPurchase]),
		).toEqual([
			["review-1", false],
			["review-2", true],
		]);
		expect(
			payload.store["risk-signal-outbox"]?.map((s) => [
				s.subjectType,
				s.signal,
				s.severity,
			]),
		).toEqual([["phone", "cod_refusal_abuse", "medium"]]);
	});

	it("leaves the score and the flag alone when any other dispute is resolved for the seller", async () => {
		const payload = world();

		await run(payload, sellerWins(), "moderator");

		expect(payload.store["buyer-phone-scores"]).toHaveLength(0);
		expect(payload.store.reviews?.[0]?.verifiedPurchase).toBe(true);
		expect(payload.store["risk-signal-outbox"]).toHaveLength(0);
	});
});
