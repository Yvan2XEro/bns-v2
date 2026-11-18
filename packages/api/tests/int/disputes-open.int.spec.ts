// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../src/lib/errors";
import { withdrawDispute } from "../../src/services/disputeActions";
import {
	openDispute,
	postDisputeMessage,
	submitDispute,
} from "../../src/services/disputes";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const USER = { id: "buyer-1", role: "user" };

function world() {
	return fakePayload(
		{
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					buyer: "buyer-1",
					shop: "shop-1",
					status: "delivered",
					paymentMethod: "cod",
					paymentStatus: "cod_collected",
					amounts: { subtotal: 10_000, deliveryFee: 1_000, total: 11_000 },
					timestamps: {
						placedAt: "2026-09-20T00:00:00.000Z",
						deliveredAt: "2026-10-01T00:00:00.000Z",
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
			disputes: [],
			"return-cases": [],
			"payout-holds": [],
			"payment-intents": [],
			"dispute-messages": [],
			reviews: [
				{
					id: "review-1",
					order: "order-1",
					reviewer: "buyer-1",
					reviewedUser: "seller-1",
					rating: 1,
					status: "published",
				},
			],
		},
		{
			globals: {
				"app-settings": {
					disputes: {
						enabled: true,
						gates: [
							{ gate: "G2", evidence: "filed" },
							{ gate: "G3", evidence: "filed" },
						],
					},
				},
			},
		},
	);
}

const input = {
	reason: "not_as_described" as const,
	description: "The delivered item is materially different from the listing.",
	requestedOutcome: "full_refund" as const,
	requestedAmount: 11_000,
	items: [{ orderItemId: "item-1", quantity: 1 }],
};

describe("dispute opening and submission", () => {
	it("opens an eligible dispute atomically and holds order completion", async () => {
		const payload = world();

		const dispute = await openDispute(payload, USER, "order-1", input, NOW);

		expect(dispute).toMatchObject({
			number: "DSP-2610-000001",
			order: "order-1",
			buyer: "buyer-1",
			reason: "not_as_described",
			status: "open",
			amountAtStake: 11_000,
			deadlines: { submitBy: "2026-10-05T12:00:00.000Z" },
		});
		expect(payload.store.orders?.[0]).toMatchObject({
			status: "disputed",
			completionHold: "dispute",
			activeDispute: dispute.id,
		});
		expect(payload.store["order-events"]?.[0]?.type).toBe("order.disputed");
		expect(payload.store.disputes).toHaveLength(1);
		expect(payload.store.reviews?.[0]?.status).toBe("held_dispute");
	});

	it("checks the active-dispute condition and evidence before state changes", async () => {
		const payload = world();
		const opened = await openDispute(payload, USER, "order-1", input, NOW);
		await expect(
			openDispute(payload, USER, "order-1", input, NOW),
		).rejects.toMatchObject({ code: ERROR_CODES.disputeAlreadyOpen });
		expect(payload.store.disputes).toHaveLength(1);

		await expect(
			submitDispute(payload, USER, String(opened.id), NOW),
		).rejects.toMatchObject({
			code: ERROR_CODES.disputeEvidenceRequired,
		});
		expect(payload.store.disputes?.[0]?.status).toBe("open");
		await payload.create({
			collection: "dispute-evidence",
			overrideAccess: true,
			data: {
				dispute: opened.id,
				uploadedBy: USER.id,
				uploadedByType: "buyer",
				kind: "photo",
				visibility: "parties",
			},
		});

		const submitted = await submitDispute(
			payload,
			USER,
			String(opened.id),
			NOW,
		);

		expect(submitted).toMatchObject({
			status: "awaiting_seller",
			deadlines: { respondBy: "2026-10-07T12:00:00.000Z" },
		});
	});

	it("stores party messages and throttles notification timestamps", async () => {
		const payload = world();
		const dispute = await openDispute(payload, USER, "order-1", input, NOW);
		const first = await postDisputeMessage(
			payload,
			USER,
			String(dispute.id),
			{ body: "I received a different item." },
			NOW,
		);
		await postDisputeMessage(
			payload,
			USER,
			String(dispute.id),
			{ body: "Here are more details." },
			new Date(NOW.getTime() + 5 * 60_000),
		);

		expect(first).toMatchObject({
			dispute: dispute.id,
			authorType: "buyer",
			kind: "message",
			body: "I received a different item.",
			visibility: "parties",
		});
		expect(payload.store["dispute-messages"]).toHaveLength(2);
		expect(payload.store.disputes?.[0]?.lastMessageNotifiedAt).toBe(
			NOW.toISOString(),
		);
	});

	it("fails closed when the feature gate or reason window is closed", async () => {
		const disabled = world();
		disabled.globals["app-settings"] = { disputes: { enabled: false } };
		await expect(
			openDispute(disabled, USER, "order-1", input, NOW),
		).rejects.toMatchObject({ code: ERROR_CODES.disputeDisabled });
		expect(disabled.store.disputes).toHaveLength(0);

		const expired = world();
		await expect(
			openDispute(
				expired,
				USER,
				"order-1",
				input,
				new Date("2026-10-20T00:00:00.000Z"),
			),
		).rejects.toMatchObject({ code: ERROR_CODES.disputeWindowClosed });
		expect(expired.store.disputes).toHaveLength(0);
	});

	it("does not allow reopening the same withdrawn reason for the same items", async () => {
		const payload = world();
		const dispute = await openDispute(payload, USER, "order-1", input, NOW);
		await withdrawDispute(payload, USER, String(dispute.id), NOW);

		await expect(
			openDispute(payload, USER, "order-1", input, NOW),
		).rejects.toMatchObject({ code: ERROR_CODES.disputeAlreadyOpen });
		expect(payload.store.disputes).toHaveLength(1);
		expect(payload.store.disputes?.[0]?.status).toBe("withdrawn");
	});
});
