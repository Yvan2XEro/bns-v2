// @vitest-environment node
import { describe, expect, it } from "vitest";
import { expirePurchaseOrders } from "../../src/services/purchaseOrders";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-04T12:00:00.000Z");

describe("purchase order acceptance expiry", () => {
	it("cancels the accepted resale order and releases the purchase order exactly once", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					shop: "reseller",
					status: "accepted",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					completionHold: "none",
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					sourcing: "resale",
					fulfillmentStatus: "unfulfilled",
				},
			],
			"purchase-orders": [
				{
					id: "po-1",
					order: "order-1",
					supplierShop: "supplier",
					resellerShop: "reseller",
					status: "sent",
					acceptBy: "2026-10-04T11:59:00.000Z",
					statusHistory: [{ status: "sent", source: "order.accepted" }],
				},
			],
		});

		const first = await expirePurchaseOrders(payload, NOW);
		const second = await expirePurchaseOrders(payload, NOW);

		expect(first).toEqual(["po-1"]);
		expect(second).toEqual([]);
		expect(payload.store.orders?.[0]).toMatchObject({
			status: "cancelled",
			cancellation: { by: "system", reason: "seller_timeout" },
		});
		expect(payload.store["order-items"]?.[0]?.fulfillmentStatus).toBe(
			"cancelled",
		);
		expect(payload.store["purchase-orders"]?.[0]).toMatchObject({
			status: "cancelled",
			cancellation: { by: "system", reason: "seller_timeout" },
		});
		expect(payload.store["order-events"]).toHaveLength(1);
	});
});
