// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { failDeliveryMock } = vi.hoisted(() => ({ failDeliveryMock: vi.fn() }));

vi.mock("../../src/services/orders/delivery", () => ({
	assertHandoverRateLimit: vi.fn(),
	markDelivered: vi.fn(),
	markDeliveryFailed: failDeliveryMock,
}));

import { failPurchaseOrderDelivery } from "../../src/services/purchaseOrders";
import { adjustResellerCommission } from "../../src/services/purchaseOrders";
import { registerResaleAdjuster } from "../../src/lib/resale";
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
					status: "shipped",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					delivery: { phone: "+237600000000" },
				},
			],
			"reseller-charges": [],
			"reseller-commissions": [
				{
					id: "commission-1",
					purchaseOrder: "po-1",
					resellerShop: "reseller",
					supplierShop: "supplier",
					order: "order-1",
					amount: 400,
					status: "accrued",
					holdReasons: [],
				},
			],
			"commission-lines": [],
			"purchase-orders": [
				{
					id: "po-1",
					number: "PO-1",
					order: "order-1",
					supplierShop: "supplier",
					resellerShop: "reseller",
					link: "link-1",
					status: "shipped",
					paymentMethod: "cod",
					items: [],
					supplierAmount: 1000,
					deliveryFee: 700,
					collectAmount: 1500,
					platformCommission: 100,
					resellerCommission: 400,
					branding: { name: "Reseller", handle: "reseller" },
					acceptBy: "2026-09-16T10:00:00.000Z",
					statusHistory: [],
				},
			],
		},
		{ globals: { "app-settings": { delivery: { zonesEnabled } } } },
	);
}

describe("purchase order delivery failure", () => {
	beforeEach(() => failDeliveryMock.mockReset().mockResolvedValue(undefined));

	it("creates the supplier compensation credit and reseller COD charge", async () => {
		const payload = seed();
		const unregister = registerResaleAdjuster({ adjustResellerCommission });
		try {
			await failPurchaseOrderDelivery(
				payload,
				{ id: "supplier-user", role: "user" },
				"po-1",
				{ reason: "refused", failedDeliveryCost: 500, note: "Buyer refused" },
			);
		} finally {
			unregister();
		}

		expect(failDeliveryMock).toHaveBeenCalledOnce();
		expect(payload.store["reseller-charges"]).toHaveLength(1);
		expect(payload.store["reseller-charges"]?.[0]).toMatchObject({
			resellerShop: "reseller",
			supplierShop: "supplier",
			purchaseOrder: "po-1",
			type: "cod_refusal_delivery_cost",
			amount: 100,
		});
		expect(payload.store["reseller-commissions"]?.[0]).toMatchObject({
			amount: 0,
			status: "cancelled",
		});
		expect(payload.store["commission-lines"]).toHaveLength(1);
		expect(payload.store["commission-lines"]?.[0]).toMatchObject({
			shop: "supplier",
			order: "order-1",
			kind: "credit",
			reason: "resale_refusal_compensation",
			amount: 500,
		});
	});

	it("rejects supplier-fault costs and caps buyer-fault costs at the delivery fee", async () => {
		const payload = seed();
		await expect(
			failPurchaseOrderDelivery(
				payload,
				{ id: "supplier-user", role: "user" },
				"po-1",
				{
					reason: "timeout",
					failedDeliveryCost: 1,
				},
			),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			failPurchaseOrderDelivery(
				payload,
				{ id: "supplier-user", role: "user" },
				"po-1",
				{
					reason: "refused",
					failedDeliveryCost: 701,
				},
			),
		).rejects.toMatchObject({ status: 400 });
		expect(failDeliveryMock).not.toHaveBeenCalled();
		expect(payload.store["reseller-charges"]).toHaveLength(0);
	});

	it("does not bypass P7 shipment failure handling when delivery zones are enabled", async () => {
		const payload = seed(true);
		await expect(
			failPurchaseOrderDelivery(
				payload,
				{ id: "supplier-user", role: "user" },
				"po-1",
				{ reason: "refused", failedDeliveryCost: 100 },
			),
		).rejects.toMatchObject({ status: 409 });
		expect(failDeliveryMock).not.toHaveBeenCalled();
	});
});
