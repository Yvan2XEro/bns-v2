// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getPurchaseOrderView } from "../../src/services/purchaseOrders";
import { fakePayload } from "./helpers/fakePayload";

function seed(role: "owner" | "staff" = "owner") {
	return fakePayload({
		users: [{ id: "supplier-user", role: "user" }],
		shops: [
			{
				id: "supplier",
				owner: "supplier-user",
				name: "Supplier",
				status: "active",
				level: 2,
			},
			{ id: "reseller", name: "Reseller", status: "active" },
		],
		"shop-members": [
			{
				id: "member",
				shop: "supplier",
				user: "supplier-user",
				role,
				status: "active",
			},
		],
		orders: [
			{
				id: "order-1",
				orderNumber: "BNS-1",
				buyer: "buyer-1",
				status: "delivered",
				delivery: {
					recipientName: "Buyer",
					phone: "+237612345678",
					city: "Douala",
					district: "Akwa",
					fee: 500,
				},
				timestamps: { deliveredAt: "2026-08-01T10:00:00.000Z" },
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
				status: "delivered",
				paymentMethod: "cod",
				items: [],
				supplierAmount: 1000,
				deliveryFee: 500,
				collectAmount: 1500,
				platformCommission: 100,
				resellerCommission: 400,
				branding: { name: "Reseller", handle: "reseller" },
				sentAt: "2026-07-01T10:00:00.000Z",
				acceptBy: "2026-07-02T10:00:00.000Z",
				statusHistory: [
					{
						status: "delivered",
						source: "test",
						at: "2026-08-01T10:00:00.000Z",
					},
				],
			},
		],
	});
}

describe("purchase order read projection", () => {
	it("masks the buyer phone after 30 days and omits money for a staff member", async () => {
		const payload = seed("staff");
		const view = await getPurchaseOrderView(
			payload,
			{ id: "supplier-user", role: "user" },
			"po-1",
			new Date("2026-09-01T10:00:00.000Z"),
		);

		expect(view.delivery).toMatchObject({
			phone: "+2376••••••78",
			phoneMasked: true,
		});
		expect(view).toMatchObject({ collectAmount: 1500, supplierAmount: null });
		expect(JSON.stringify(view)).not.toContain("+237612345678");
	});

	it("returns full money and contact details to an authorized owner during fulfilment", async () => {
		const payload = seed();
		payload.store.orders[0]!.status = "accepted";
		const view = await getPurchaseOrderView(
			payload,
			{ id: "supplier-user", role: "user" },
			"po-1",
			new Date("2026-07-01T11:00:00.000Z"),
		);

		expect(view.delivery.phone).toBe("+237612345678");
		expect(view).toMatchObject({
			supplierAmount: 1000,
			platformCommission: 100,
			resellerCommission: 400,
		});
	});

	it("does not disclose a purchase order to a non-party", async () => {
		const payload = seed();
		await expect(
			getPurchaseOrderView(payload, { id: "stranger", role: "user" }, "po-1"),
		).rejects.toMatchObject({ status: 404 });
	});

	it("applies the same aged-phone masking to staff projections", async () => {
		const payload = seed();
		const view = await getPurchaseOrderView(
			payload,
			{ id: "moderator", role: "moderator" },
			"po-1",
			new Date("2026-09-01T10:00:00.000Z"),
		);

		expect(view.delivery.phone).toBe("+2376••••••78");
		expect(view.delivery.phoneMasked).toBe(true);
	});
});
