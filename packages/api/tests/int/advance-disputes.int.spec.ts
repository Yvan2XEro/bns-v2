// @vitest-environment node
import { describe, expect, it } from "vitest";
import { advanceDisputes } from "../../src/services/advanceDisputes";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-04T12:00:00.000Z");

function world(withActiveReturn = false) {
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
		"order-items": [
			{
				id: "item-1",
				order: "order-1",
				unitPrice: 10_000,
				quantity: 1,
				fulfillmentStatus: "shipped",
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
				subject: "goods",
				items: [{ orderItem: "item-1", quantity: 1 }],
				reason: withActiveReturn ? "damaged" : "not_received",
				openedByType: "buyer",
				paymentMethod: "cod",
				amountAtStake: 11_000,
				status: "awaiting_seller",
				statusHistory: [
					{ status: "open", actorType: "buyer" },
					{ status: "awaiting_seller", actorType: "buyer" },
				],
				deadlines: { respondBy: "2026-10-04T11:00:00.000Z" },
			},
		],
		"return-cases": withActiveReturn
			? [
					{
						id: "return-1",
						order: "order-1",
						status: "requested",
					},
				]
			: [],
		"dispute-evidence": [],
		"dispute-messages": [],
		"payout-holds": withActiveReturn
			? [
					{
						id: "hold-dispute",
						shop: "shop-1",
						order: "order-1",
						scope: "order",
						reason: "dispute_open",
						status: "active",
					},
				]
			: [],
		"shop-strikes": [],
		"risk-signal-outbox": [],
	});
}

describe("advanceDisputes", () => {
	it("applies the no-proof not-received silence default once", async () => {
		const payload = world();
		const first = await advanceDisputes(payload, NOW);
		const second = await advanceDisputes(payload, NOW);

		expect(first.resolved).toBe(1);
		expect(second.resolved).toBe(0);
		expect(payload.store.disputes?.[0]?.status).toBe("resolved_buyer");
		expect(payload.store["return-cases"]).toHaveLength(1);
		expect(payload.store["dispute-messages"]).toHaveLength(1);
		expect(payload.store.orders?.[0]).toMatchObject({
			status: "cancelled",
			activeDispute: null,
		});
	});

	it("keeps a return hold and releases the dispute payout hold on auto-withdrawal", async () => {
		const payload = world(true);
		const dispute = payload.store.disputes?.[0];
		if (!dispute) throw new Error("dispute fixture missing");
		await payload.update({
			collection: "disputes",
			id: String(dispute.id),
			overrideAccess: true,
			data: {
				status: "open",
				openedByType: "buyer",
				deadlines: { submitBy: "2026-10-04T11:00:00.000Z" },
			},
		});

		const result = await advanceDisputes(payload, NOW);

		expect(result.withdrawn).toBe(1);
		expect(payload.store.orders?.[0]?.completionHold).toBe("return_case");
		expect(payload.store["payout-holds"]?.[0]?.status).toBe("released");
	});

	it("notifies overdue review once and persists the idempotency timestamp", async () => {
		const payload = world();
		const dispute = payload.store.disputes?.[0];
		if (!dispute) throw new Error("dispute fixture missing");
		await payload.update({
			collection: "disputes",
			id: String(dispute.id),
			overrideAccess: true,
			data: {
				status: "under_review",
				deadlines: { reviewDueAt: "2026-10-04T11:00:00.000Z" },
			},
		});

		const first = await advanceDisputes(payload, NOW);
		const second = await advanceDisputes(payload, NOW);

		expect(first.reviewOverdue).toBe(1);
		expect(second.reviewOverdue).toBe(0);
		const deadlines = payload.store.disputes?.[0]?.deadlines;
		if (!deadlines || typeof deadlines !== "object" || Array.isArray(deadlines))
			throw new Error("dispute deadline fixture missing");
		expect((deadlines as Record<string, unknown>).reviewOverdueNotifiedAt).toBe(
			NOW.toISOString(),
		);
	});
});
