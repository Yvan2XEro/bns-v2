// @vitest-environment node
import { describe, expect, it } from "vitest";
import { listShopPurchaseOrders } from "../../src/services/purchaseOrders";
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
			{ id: "stranger-shop", name: "Stranger", status: "active" },
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
		"purchase-orders": [
			{
				id: "po-1",
				number: "PO-2609-0001",
				order: "order-1",
				supplierShop: "supplier",
				resellerShop: "reseller",
				link: "link-1",
				status: "sent",
				paymentMethod: "cod",
				items: [
					{
						title: "Phone",
						quantity: 2,
						supplierUnitPrice: 1000,
						resellerUnitPrice: 1500,
					},
				],
				supplierAmount: 2000,
				deliveryFee: 500,
				collectAmount: 3500,
				platformCommission: 100,
				resellerCommission: 900,
				branding: { name: "Reseller", handle: "reseller" },
				sentAt: "2026-09-01T10:00:00.000Z",
				acceptBy: "2026-09-02T10:00:00.000Z",
			},
		],
	});
}

describe("purchase order inbox", () => {
	it("returns only the selected side's orders and hides money from staff", async () => {
		const payload = seed("staff");
		const result = await listShopPurchaseOrders(
			payload,
			{ id: "supplier-user", role: "user" },
			"supplier",
			{ side: "supplier" },
		);

		expect(result.totalDocs).toBe(1);
		expect(result.docs[0]).toMatchObject({
			id: "po-1",
			number: "PO-2609-0001",
			counterparty: { id: "reseller", name: "Reseller" },
			collectAmount: 3500,
			supplierAmount: null,
			items: [{ title: "Phone", quantity: 2 }],
		});
		expect(JSON.stringify(result)).not.toContain("supplierUnitPrice");
	});

	it("filters status, date and search while including readable payout values", async () => {
		const payload = seed();
		const result = await listShopPurchaseOrders(
			payload,
			{ id: "supplier-user", role: "user" },
			"supplier",
			{
				side: "supplier",
				status: "sent",
				from: "2026-09-01T00:00:00.000Z",
				q: "2609-0001",
			},
		);

		expect(result.docs).toHaveLength(1);
		expect(result.docs[0]).toMatchObject({ supplierAmount: 2000 });
	});

	it("denies a stranger and does not confuse the two shop sides", async () => {
		const payload = seed();
		await expect(
			listShopPurchaseOrders(
				payload,
				{ id: "other", role: "user" },
				"supplier",
				{
					side: "supplier",
				},
			),
		).rejects.toMatchObject({ status: 403 });
		const wrongSide = await listShopPurchaseOrders(
			payload,
			{ id: "supplier-user", role: "user" },
			"supplier",
			{
				side: "reseller",
			},
		);
		expect(wrongSide.docs).toEqual([]);
	});
});
