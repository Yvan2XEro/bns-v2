// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../src/lib/errors";
import {
	assignDispute,
	redactDisputeMessage,
	resolveDispute,
	revokeDisputeStrike,
} from "../../src/services/disputeModeration";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const ADMIN = { id: "admin-1", role: "admin" };

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
				timestamps: { shippedAt: "2026-09-30T00:00:00.000Z" },
			},
		],
		"order-items": [],
		"order-events": [],
		disputes: [
			{
				id: "dispute-1",
				number: "DSP-2610-000001",
				order: "order-1",
				shop: "shop-1",
				buyer: "buyer-1",
				subject: "goods",
				items: [],
				reason: "not_received",
				openedByType: "buyer",
				paymentMethod: "cod",
				amountAtStake: 11_000,
				status: "under_review",
				statusHistory: [
					{ status: "open", actorType: "buyer" },
					{ status: "under_review", actorType: "seller" },
				],
			},
		],
		"dispute-messages": [
			{
				id: "message-1",
				dispute: "dispute-1",
				body: "Sensitive personal data",
				visibility: "parties",
			},
		],
		"return-cases": [],
		"payout-holds": [],
		"shop-strikes": [
			{
				id: "strike-1",
				shop: "shop-1",
				kind: "dispute_lost",
				weight: 1,
				status: "active",
				sourceType: "dispute",
				sourceId: "dispute-1",
				expiresAt: "2027-01-01T00:00:00.000Z",
			},
		],
		"risk-signal-outbox": [],
		"moderation-log": [],
	});
}

const sellerOutcome = {
	outcome: "resolved_seller" as const,
	refundAmount: 0,
	returnRequired: false,
	returnShippingPaidBy: null,
	liableParty: "buyer" as const,
	reasonCode: "buyer_abuse" as const,
	publicStatement: {
		fr: "La demande est rejetée.",
		en: "The claim is rejected.",
	},
};

describe("moderator dispute arbitration", () => {
	it("requires a reasoned override before a seller ruling without proof", async () => {
		const payload = world();
		await expect(
			resolveDispute(
				payload,
				ADMIN,
				"dispute-1",
				{
					...sellerOutcome,
					note: "Insufficient evidence.",
				},
				NOW,
			),
		).rejects.toMatchObject({ code: ERROR_CODES.moderationReasonRequired });
		expect(payload.store.disputes?.[0]?.status).toBe("under_review");
		expect(payload.store["moderation-log"]).toHaveLength(0);
	});

	it("commits the decision and its audit record together", async () => {
		const payload = world();
		const resolved = await resolveDispute(
			payload,
			ADMIN,
			"dispute-1",
			{
				...sellerOutcome,
				note: "The buyer's account is inconsistent with the verified shipping records.",
			},
			NOW,
		);

		expect(resolved.status).toBe("resolved_seller");
		expect(payload.store["moderation-log"]).toHaveLength(1);
		expect(payload.store["moderation-log"]?.[0]).toMatchObject({
			action: "dispute.resolve",
			targetType: "dispute",
			targetId: "dispute-1",
			reason: "buyer_abuse",
			metadata: {
				outcome: "resolved_seller",
				refundAmount: 0,
				returnCaseId: null,
				refundId: null,
				proofChecklist: [
					{
						requirement: "handover_otp_verified",
						established: false,
						source: null,
					},
					{
						requirement: "pod_within_200m",
						established: false,
						source: null,
					},
				],
			},
		});
	});

	it("assigns a case and redacts a message with auditable reasons", async () => {
		const payload = world();
		const assigned = await assignDispute(payload, ADMIN, "dispute-1");
		await redactDisputeMessage(
			payload,
			ADMIN,
			"dispute-1",
			"message-1",
			"Contains personal information that must not remain visible.",
		);

		expect(assigned.assignedTo).toBe("admin-1");
		expect(payload.store["dispute-messages"]?.[0]).toMatchObject({
			body: null,
			redactedBy: "admin-1",
		});
		expect(payload.store["moderation-log"]?.map((row) => row.action)).toEqual([
			"dispute.assign",
			"dispute.redact_message",
		]);
		expect(payload.store["moderation-log"]?.[1]?.metadata).toMatchObject({
			messageId: "message-1",
			originalBody: "Sensitive personal data",
		});
	});

	it("limits strike revocation to admins and audits successful reversal", async () => {
		const payload = world();
		await expect(
			revokeDisputeStrike(
				payload,
				{ id: "moderator-1", role: "moderator" },
				"strike-1",
				"The original ruling was reversed after reviewing new evidence.",
			),
		).rejects.toMatchObject({ code: ERROR_CODES.moderationRankTooLow });
		await revokeDisputeStrike(
			payload,
			ADMIN,
			"strike-1",
			"The original ruling was reversed after reviewing new evidence.",
		);

		expect(payload.store["shop-strikes"]?.[0]?.status).toBe("revoked");
		expect(payload.store["moderation-log"]?.[0]).toMatchObject({
			action: "strike.revoke",
			targetId: "dispute-1",
			metadata: { strikeId: "strike-1", shopId: "shop-1" },
		});
	});
});
