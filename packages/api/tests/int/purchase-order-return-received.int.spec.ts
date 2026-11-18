// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { applyMovementMock } = vi.hoisted(() => ({
	applyMovementMock: vi.fn(),
}));

vi.mock("../../src/services/stock", () => ({
	applyMovement: applyMovementMock,
}));

import { receivePurchaseOrderReturn } from "../../src/services/purchaseOrders";
import { fakePayload } from "./helpers/fakePayload";

function seed() {
	return fakePayload({
		shops: [
			{ id: "supplier", owner: "supplier-user", status: "active", level: 3 },
			{ id: "reseller", owner: "reseller-user", status: "active", level: 2 },
		],
		"shop-members": [
			{
				id: "supplier-membership",
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
				status: "returned",
				paymentMethod: "cod",
			},
		],
		"order-items": [
			{
				id: "item-1",
				order: "order-1",
				sourcing: "resale",
				fulfillmentStatus: "failed",
			},
		],
		"product-variants": [
			{
				id: "variant-1",
				shop: "supplier",
				product: "product-1",
				trackInventory: true,
				stockOnHand: 4,
				stockReserved: 0,
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
				status: "returned",
				paymentMethod: "cod",
				items: [
					{
						orderItem: "item-1",
						variant: "variant-1",
						quantity: 2,
						supplierUnitPrice: 1200,
						resellerUnitPrice: 2000,
						title: "Product",
					},
				],
				supplierAmount: 2400,
				deliveryFee: 500,
				collectAmount: 4500,
				platformCommission: 100,
				resellerCommission: 300,
				branding: { name: "Reseller", handle: "reseller" },
				statusHistory: [],
			},
		],
	});
}

describe("purchase order return received", () => {
	beforeEach(() => {
		applyMovementMock.mockReset().mockResolvedValue(undefined);
	});

	it("records a damaged returned parcel as a supplier stock loss", async () => {
		const payload = seed();
		const result = await receivePurchaseOrderReturn(
			payload,
			{ id: "supplier-user", role: "user" },
			"po-1",
			{ condition: "damaged" },
		);

		expect(result).toMatchObject({
			status: "returned",
			return: { condition: "damaged", receivedAt: expect.any(String) },
		});
		expect(applyMovementMock).toHaveBeenCalledWith(
			expect.objectContaining({ payload }),
			expect.objectContaining({
				variant: expect.objectContaining({ id: "variant-1" }),
				type: "loss",
				quantity: -2,
				actorId: "supplier-user",
			}),
		);
		expect(payload.store["purchase-orders"]?.[0]).toMatchObject({
			return: { condition: "damaged" },
		});
		expect(payload.store["order-items"]?.[0]?.fulfillmentStatus).toBe("failed");
	});

	it("does not change stock for a resellable return or receive the same parcel twice", async () => {
		const payload = seed();
		const purchaseOrder = payload.store["purchase-orders"]?.[0];
		if (!purchaseOrder) throw new Error("Purchase order fixture missing");
		await receivePurchaseOrderReturn(
			payload,
			{ id: "supplier-user", role: "user" },
			"po-1",
			{ condition: "resellable" },
		);
		await expect(
			receivePurchaseOrderReturn(
				payload,
				{ id: "supplier-user", role: "user" },
				"po-1",
				{ condition: "resellable" },
			),
		).rejects.toMatchObject({ status: 409 });
		expect(applyMovementMock).not.toHaveBeenCalled();
	});
});
