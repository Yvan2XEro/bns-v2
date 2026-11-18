// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { handoverMock } = vi.hoisted(() => ({ handoverMock: vi.fn() }));
vi.mock("../../src/services/orders/handover", () => ({
	issueHandoverCode: handoverMock,
}));

import { shipPurchaseOrder } from "../../src/services/purchaseOrders";
import { fakePayload } from "./helpers/fakePayload";

function seed(zonesEnabled = false) {
	return fakePayload(
		{
			shops: [
				{ id: "supplier", owner: "supplier-user", status: "active", level: 2 },
				{ id: "reseller", status: "active", level: 2 },
			],
			"shop-members": [
				{
					id: "membership",
					shop: "supplier",
					user: "supplier-user",
					role: "owner",
					status: "active",
				},
			],
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					shop: "reseller",
					buyer: "buyer",
					status: "accepted",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					delivery: {
						method: "seller_delivery",
						recipientName: "Buyer",
						phone: "+237600000000",
					},
					timestamps: { acceptedAt: "2026-09-15T10:00:00.000Z" },
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					sourcing: "resale",
					fulfillingShop: "supplier",
					fulfillmentStatus: "unfulfilled",
				},
			],
			"purchase-orders": [
				{
					id: "po-1",
					number: "PO-1",
					order: "order-1",
					supplierShop: "supplier",
					resellerShop: "reseller",
					link: "link-1",
					status: "accepted",
					paymentMethod: "cod",
					items: [{ orderItem: "item-1" }],
					supplierAmount: 1000,
					deliveryFee: 0,
					collectAmount: 1500,
					platformCommission: 100,
					resellerCommission: 400,
					branding: { name: "Reseller", handle: "reseller" },
					acceptBy: "2026-09-16T10:00:00.000Z",
					acceptedAt: "2026-09-15T10:00:00.000Z",
					statusHistory: [
						{
							status: "sent",
							source: "order.accepted",
							at: "2026-09-15T09:00:00.000Z",
						},
					],
				},
			],
		},
		{ globals: { "app-settings": { delivery: { zonesEnabled } } } },
	);
}

describe("supplier purchase order shipping", () => {
	beforeEach(() => handoverMock.mockReset().mockResolvedValue(undefined));

	it("ships the accepted order via P4 and records the supplier's tracking", async () => {
		const payload = seed();
		const result = await shipPurchaseOrder(
			payload,
			{ id: "supplier-user", role: "user" },
			"po-1",
			{
				carrier: "other",
				trackingNumber: "TRACK-42",
				trackingUrl: "https://carrier.test/42",
			},
		);

		expect(result).toMatchObject({
			status: "shipped",
			tracking: {
				carrier: "other",
				trackingNumber: "TRACK-42",
				trackingUrl: "https://carrier.test/42",
			},
		});
		expect(payload.store.orders[0]?.status).toBe("shipped");
		expect(payload.store["order-items"][0]?.fulfillmentStatus).toBe("shipped");
		expect(handoverMock).toHaveBeenCalledTimes(1);
	});

	it("requires tracking for external carriers and leaves the order untouched", async () => {
		const payload = seed();
		await expect(
			shipPurchaseOrder(
				payload,
				{ id: "supplier-user", role: "user" },
				"po-1",
				{
					carrier: "other",
				},
			),
		).rejects.toMatchObject({ status: 409 });
		expect(payload.store.orders[0]?.status).toBe("accepted");
	});

	it("leaves shipment transitions to P7 when delivery zones are enabled", async () => {
		const payload = seed(true);
		await expect(
			shipPurchaseOrder(
				payload,
				{ id: "supplier-user", role: "user" },
				"po-1",
				{
					carrier: "own_courier",
				},
			),
		).rejects.toMatchObject({ status: 409 });
		expect(payload.store.orders[0]?.status).toBe("accepted");
		expect(handoverMock).not.toHaveBeenCalled();
	});
});
