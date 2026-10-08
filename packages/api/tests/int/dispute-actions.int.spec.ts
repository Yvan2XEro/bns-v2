// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../src/lib/errors";
import {
	answerProposal,
	respondToDispute,
} from "../../src/services/disputeActions";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const BUYER = { id: "buyer-1", role: "user" };

function world(round = 0) {
	return fakePayload({
		orders: [
			{
				id: "order-1",
				buyer: "buyer-1",
				shop: "shop-1",
				status: "disputed",
				paymentMethod: "cod",
				paymentStatus: "cod_collected",
				amounts: { subtotal: 10_000, deliveryFee: 1_000, total: 11_000 },
			},
		],
		"order-events": [],
		disputes: [
			{
				id: "dispute-1",
				number: "DSP-2610-000001",
				order: "order-1",
				shop: "shop-1",
				buyer: "buyer-1",
				reason: "not_as_described",
				openedByType: "seller",
				paymentMethod: "cod",
				amountAtStake: 11_000,
				status: "awaiting_buyer",
				statusHistory: [{ status: "awaiting_buyer", actorType: "seller" }],
				proposal: round > 0 ? { round, status: "rejected" } : undefined,
			},
		],
		"dispute-messages": [],
		"shop-memberships": [],
		"return-cases": [],
		"payout-holds": [],
		"shop-strikes": [],
		"risk-signal-outbox": [],
	});
}

describe("dispute party actions", () => {
	it("rejects a proposal beyond the configured round limit", async () => {
		const payload = world(3);
		await expect(
			respondToDispute(
				payload,
				BUYER,
				"dispute-1",
				{
					action: "propose",
					amount: 5_000,
					message: "I propose a partial resolution.",
				},
				NOW,
			),
		).rejects.toMatchObject({ code: ERROR_CODES.disputeProposalInvalid });
		expect(payload.store["dispute-messages"]).toHaveLength(0);
	});

	it("requires evidence before contesting a proposal", async () => {
		const payload = world();
		await expect(
			respondToDispute(
				payload,
				BUYER,
				"dispute-1",
				{
					action: "contest",
					message: "I contest the proposed resolution.",
				},
				NOW,
			),
		).rejects.toMatchObject({ code: ERROR_CODES.disputeEvidenceRequired });
		expect(payload.store.disputes?.[0]?.status).toBe("awaiting_buyer");
	});

	it("accepts a proposal at the full refundable amount as a buyer resolution", async () => {
		const payload = world();
		const dispute = payload.store.disputes?.[0];
		if (!dispute) throw new Error("dispute fixture missing");
		dispute.proposal = {
			amount: 11_000,
			returnRequired: false,
			byType: "seller",
			by: "seller-1",
			at: NOW.toISOString(),
			expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
			round: 1,
			status: "open",
		};

		const resolved = await answerProposal(
			payload,
			BUYER,
			"dispute-1",
			"accept",
			NOW,
		);

		expect(resolved.status).toBe("resolved_buyer");
		expect(payload.store["shop-strikes"]).toHaveLength(0);
		expect(payload.store["return-cases"]).toHaveLength(1);
	});
});
