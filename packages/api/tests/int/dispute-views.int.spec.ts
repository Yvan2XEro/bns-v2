// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getDisputeView } from "../../src/services/disputeViews";
import { fakePayload } from "./helpers/fakePayload";

function world() {
	return fakePayload({
		orders: [
			{
				id: "order-1",
				orderNumber: "BNS-2026-001",
				buyer: "buyer-1",
				shop: "shop-1",
				paymentMethod: "cod",
				paymentStatus: "cod_collected",
				amounts: { total: 12_000 },
				handover: { method: "otp", verifiedAt: "2026-10-01T10:00:00.000Z" },
			},
		],
		"order-items": [
			{
				id: "item-1",
				order: "order-1",
				quantity: 1,
				unitPrice: 12_000,
				snapshot: { title: "Phone", imageUrl: "private-image" },
			},
		],
		shops: [{ id: "shop-1", name: "Shop One", handle: "shop-one" }],
		disputes: [
			{
				id: "dispute-1",
				number: "DSP-2610-000001",
				order: "order-1",
				shop: "shop-1",
				buyer: "buyer-1",
				subject: "goods",
				reason: "damaged",
				status: "awaiting_seller",
				paymentMethod: "cod",
				amountAtStake: 12_000,
				items: [{ orderItem: "item-1", quantity: 1 }],
				requestedOutcome: "full_refund",
				openedByType: "buyer",
				deadlines: { respondBy: "2026-10-05T10:00:00.000Z" },
			},
		],
		"dispute-messages": [
			{
				id: "message-party",
				dispute: "dispute-1",
				authorType: "buyer",
				kind: "message",
				body: "Visible to both parties",
				visibility: "parties",
				createdAt: "2026-10-04T10:00:00.000Z",
			},
			{
				id: "message-staff",
				dispute: "dispute-1",
				authorType: "moderator",
				kind: "system",
				body: "STAFF_ONLY_MARKER",
				visibility: "staff",
				createdAt: "2026-10-04T11:00:00.000Z",
			},
		],
		"dispute-evidence": [],
		"order-events": [],
	});
}

describe("getDisputeView", () => {
	it("excludes staff messages and order internals from party responses", async () => {
		const payload = world();
		const view = await getDisputeView(
			payload,
			{ id: "buyer-1", role: "user" },
			"dispute-1",
		);

		expect(view.messages.map(({ body }) => body)).toEqual([
			"Visible to both parties",
		]);
		expect(JSON.stringify(view)).not.toContain("STAFF_ONLY_MARKER");
		expect(view.systemEvidence.snapshot).toBeNull();
		expect(view.allowedActions).toContain("message");
		expect(view.items).toEqual([
			{ orderItemId: "item-1", title: "Phone", quantity: 1 },
		]);
	});

	it("includes staff-only messages and a narrow item snapshot for moderators", async () => {
		const view = await getDisputeView(
			world(),
			{ id: "admin-1", role: "admin" },
			"dispute-1",
		);

		expect(view.messages.map(({ body }) => body)).toContain(
			"STAFF_ONLY_MARKER",
		);
		expect(view.systemEvidence.snapshot).toEqual([
			{
				id: "item-1",
				snapshot: { title: "Phone", imageUrl: "private-image" },
				quantity: 1,
				unitPrice: 12_000,
			},
		]);
	});
});
