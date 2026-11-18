// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	markDeliveredMock,
	verifyMock,
	handoverShipmentMock,
	declareShipmentDeliveredMock,
} = vi.hoisted(() => ({
	markDeliveredMock: vi.fn(),
	verifyMock: vi.fn(),
	handoverShipmentMock: vi.fn(),
	declareShipmentDeliveredMock: vi.fn(),
}));

vi.mock("../../src/services/orders/delivery", () => ({
	assertHandoverRateLimit: vi.fn().mockResolvedValue(undefined),
	markDelivered: markDeliveredMock,
}));
vi.mock("../../src/services/orders/handover", () => ({
	verifyHandoverCode: verifyMock,
}));
vi.mock("../../src/services/delivery/handover", () => ({
	declareDelivered: declareShipmentDeliveredMock,
	handoverShipment: handoverShipmentMock,
}));

import {
	declarePurchaseOrderDelivered,
	handoverPurchaseOrder,
} from "../../src/services/purchaseOrders";
import { fakePayload } from "./helpers/fakePayload";

function seed() {
	return fakePayload({
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
				amounts: { total: 1500 },
				handover: { codeHash: "hash", attempts: 0 },
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
				status: "shipped",
				paymentMethod: "cod",
				items: [],
				supplierAmount: 1000,
				deliveryFee: 0,
				collectAmount: 1500,
				platformCommission: 100,
				resellerCommission: 400,
				branding: { name: "Reseller", handle: "reseller" },
				acceptBy: "2026-09-16T10:00:00.000Z",
				statusHistory: [],
			},
		],
	});
}

describe("purchase order handover", () => {
	beforeEach(() => {
		markDeliveredMock.mockReset().mockResolvedValue(undefined);
		verifyMock.mockReset().mockResolvedValue({ ok: true });
		handoverShipmentMock.mockReset();
		declareShipmentDeliveredMock.mockReset();
	});

	it("verifies the buyer code as the supplier and completes P4 delivery", async () => {
		const payload = seed();
		await handoverPurchaseOrder(
			payload,
			{ id: "supplier-user", role: "user" },
			"po-1",
			"4821",
		);

		expect(verifyMock).toHaveBeenCalledWith(
			expect.objectContaining({ user: { id: "supplier-user", role: "user" } }),
			payload.store.orders[0],
			"4821",
			expect.objectContaining({
				actor: { type: "seller", id: "supplier-user" },
			}),
		);
		expect(markDeliveredMock).toHaveBeenCalledWith(
			expect.anything(),
			payload.store.orders[0],
			expect.objectContaining({
				method: "otp",
				actorType: "seller",
				actor: "supplier-user",
			}),
		);
	});

	it("rejects a reseller member attempting to hand over the supplier order", async () => {
		const payload = seed();
		await expect(
			handoverPurchaseOrder(
				payload,
				{ id: "reseller-user", role: "user" },
				"po-1",
				"4821",
			),
		).rejects.toMatchObject({ status: 403 });
		expect(verifyMock).not.toHaveBeenCalled();
	});

	it("records a supplier delivery declaration through P4 when no P7 shipment exists", async () => {
		const payload = seed();
		await declarePurchaseOrderDelivered(
			payload,
			{ id: "supplier-user", role: "user" },
			"po-1",
			{ note: "Handed to recipient", photoId: "proof-1" },
		);

		expect(markDeliveredMock).toHaveBeenCalledWith(
			expect.anything(),
			payload.store.orders[0],
			expect.objectContaining({
				method: "seller_declaration",
				actorType: "seller",
				actor: "supplier-user",
				note: "Handed to recipient",
				photo: "proof-1",
			}),
		);
	});
});
