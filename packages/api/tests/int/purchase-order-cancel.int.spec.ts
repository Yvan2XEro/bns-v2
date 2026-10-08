// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cancelResalePurchaseOrder } from "../../src/services/orders/acceptance";
import { fakePayload } from "./helpers/fakePayload";

describe("supplier purchase-order cancellation", () => {
	it("cancels the P4 order and purchase order together with supplier attribution", async () => {
		const payload = fakePayload({
			shops: [{ id: "supplier", owner: "supplier-user", status: "active" }],
			"shop-members": [
				{
					id: "member",
					shop: "supplier",
					user: "supplier-user",
					role: "owner",
					status: "active",
				},
			],
			orders: [
				{
					id: "order",
					orderNumber: "BNS-1",
					shop: "reseller",
					status: "accepted",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
				},
			],
			"order-items": [
				{
					id: "item",
					order: "order",
					sourcing: "resale",
					fulfillingShop: "supplier",
					fulfillmentStatus: "unfulfilled",
				},
			],
			"purchase-orders": [
				{
					id: "po",
					number: "PO-1",
					order: "order",
					supplierShop: "supplier",
					resellerShop: "reseller",
					status: "accepted",
					cancellation: {},
					statusHistory: [],
				},
			],
		});

		const result = await cancelResalePurchaseOrder(
			payload,
			{ id: "supplier-user", role: "user" },
			"po",
			{ reason: "seller_out_of_stock" },
		);

		expect(result).toMatchObject({
			status: "cancelled",
			cancellation: { by: "supplier", reason: "seller_out_of_stock" },
		});
		expect(payload.store.orders[0]).toMatchObject({
			status: "cancelled",
			cancellation: { by: "seller", reason: "seller_out_of_stock" },
		});
		expect(payload.store["order-items"][0]?.fulfillmentStatus).toBe(
			"cancelled",
		);
	});

	it("requires an explanatory note for the other reason and leaves state unchanged", async () => {
		const payload = fakePayload({
			shops: [{ id: "supplier", owner: "supplier-user", status: "active" }],
			"shop-members": [
				{
					id: "member",
					shop: "supplier",
					user: "supplier-user",
					role: "owner",
					status: "active",
				},
			],
			orders: [
				{
					id: "order",
					orderNumber: "BNS-1",
					shop: "reseller",
					status: "accepted",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
				},
			],
			"purchase-orders": [
				{
					id: "po",
					order: "order",
					supplierShop: "supplier",
					resellerShop: "reseller",
					status: "accepted",
					cancellation: {},
					statusHistory: [],
				},
			],
		});

		await expect(
			cancelResalePurchaseOrder(
				payload,
				{ id: "supplier-user", role: "user" },
				"po",
				{ reason: "seller_other" },
			),
		).rejects.toMatchObject({ status: 400 });
		expect(payload.store.orders[0]?.status).toBe("accepted");
		expect(payload.store["purchase-orders"][0]?.status).toBe("accepted");
	});
});
