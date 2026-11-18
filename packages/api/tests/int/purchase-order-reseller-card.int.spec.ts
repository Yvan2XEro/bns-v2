// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isDueToday } from "../../src/contracts/purchaseOrders";
import {
	endOfShopDay,
	getPurchaseOrderView,
	listShopPurchaseOrders,
} from "../../src/services/purchaseOrders";
import { fakePayload } from "./helpers/fakePayload";

// 13:00 in Douala (UTC+1); the local day ends at 2026-10-16T23:00:00Z.
const NOW = new Date("2026-10-16T12:00:00.000Z");

function po(id: string, status: string, shipBy?: string) {
	return {
		id,
		number: `PO-${id}`,
		order: "order-1",
		supplierShop: "supplier",
		resellerShop: "reseller",
		link: "link-1",
		status,
		paymentMethod: "cod",
		items: [
			{
				title: "Cable",
				quantity: 1,
				variant: "variant-1",
				supplierUnitPrice: 1000,
				resellerUnitPrice: 1500,
			},
			{
				title: "Charger",
				quantity: 2,
				variant: "variant-2",
				supplierUnitPrice: 1000,
				resellerUnitPrice: 1500,
			},
		],
		supplierAmount: 3000,
		deliveryFee: 500,
		collectAmount: 5000,
		platformCommission: 100,
		resellerCommission: 900,
		branding: {
			name: "Akwa Tech",
			handle: "akwa-tech",
			phone: "+237699000000",
		},
		sentAt: "2026-10-15T10:00:00.000Z",
		acceptBy: "2026-10-16T10:00:00.000Z",
		...(shipBy ? { shipBy } : {}),
	};
}

function seed() {
	return fakePayload({
		shops: [
			{
				id: "supplier",
				owner: "supplier-user",
				name: "Supplier",
				status: "active",
				level: 3,
			},
			{
				id: "reseller",
				owner: "reseller-user",
				name: "Akwa Tech Store",
				handle: "akwa-tech",
				status: "active",
				level: 2,
			},
		],
		"shop-members": [
			{
				id: "supplier-member",
				shop: "supplier",
				user: "supplier-user",
				role: "owner",
				status: "active",
			},
		],
		"shop-locations": [
			{
				id: "loc-1",
				shop: "reseller",
				active: true,
				openingHours: [
					{ day: "mon", opens: "08:00", closes: "18:00" },
					{ day: "sat", opens: "09:00", closes: "13:00" },
				],
			},
			{
				id: "loc-closed",
				shop: "reseller",
				active: false,
				openingHours: [{ day: "mon", opens: "06:00", closes: "22:00" }],
			},
		],
		orders: [
			{
				id: "order-1",
				orderNumber: "BNS-2609-000121",
				buyer: "buyer-1",
				status: "accepted",
				createdAt: "2026-10-15T09:48:00.000Z",
				delivery: {
					recipientName: "Eric K.",
					phone: "+237612345678",
					city: "Douala",
					district: "Akwa",
					fee: 500,
				},
			},
		],
		media: [
			{ id: "media-1", url: "/m/cable.jpg", thumbnailURL: "/m/cable-t.jpg" },
		],
		products: [
			{ id: "product-1", shop: "supplier", images: [{ image: "media-1" }] },
			{ id: "product-2", shop: "supplier", images: [] },
		],
		"product-variants": [
			{ id: "variant-1", product: "product-1" },
			{ id: "variant-2", product: "product-2" },
		],
		"purchase-orders": [
			po("due-today", "accepted", "2026-10-16T20:00:00.000Z"),
			po("overdue", "accepted", "2026-10-15T20:00:00.000Z"),
			po("tomorrow", "accepted", "2026-10-16T23:30:00.000Z"),
			po("not-accepted", "sent"),
			po("shipped", "shipped", "2026-10-16T08:00:00.000Z"),
		],
	});
}

describe("purchase orders due today", () => {
	it("counts accepted orders whose handling deadline ends before tonight", () => {
		const end = new Date("2026-10-16T23:00:00.000Z");
		expect(
			isDueToday(
				{ status: "accepted", shipBy: "2026-10-16T20:00:00.000Z" },
				end,
			),
		).toBe(true);
		expect(
			isDueToday(
				{ status: "accepted", shipBy: "2026-10-10T20:00:00.000Z" },
				end,
			),
		).toBe(true);
		expect(
			isDueToday(
				{ status: "accepted", shipBy: "2026-10-16T23:00:00.000Z" },
				end,
			),
		).toBe(false);
		expect(isDueToday({ status: "sent", shipBy: null }, end)).toBe(false);
		expect(
			isDueToday(
				{ status: "shipped", shipBy: "2026-10-16T08:00:00.000Z" },
				end,
			),
		).toBe(false);
	});

	it("ends the day at the supplier's local midnight", async () => {
		const end = await endOfShopDay(seed(), {}, NOW);
		expect(end.toISOString()).toBe("2026-10-16T23:00:00.000Z");
	});

	it("filters the supplier's list to today's deadlines, overdue included", async () => {
		const result = await listShopPurchaseOrders(
			seed(),
			{ id: "supplier-user", role: "user" },
			"supplier",
			{ side: "supplier", dueToday: true },
			NOW,
		);
		expect(result.docs.map((row) => row.id).sort()).toEqual([
			"due-today",
			"overdue",
		]);
		expect(result.totalDocs).toBe(2);
	});

	it("gives each article its product's first image, small", async () => {
		const result = await listShopPurchaseOrders(
			seed(),
			{ id: "supplier-user", role: "user" },
			"supplier",
			{ side: "supplier", status: "sent" },
			NOW,
		);
		expect(result.docs[0]?.items).toEqual([
			{ title: "Cable", quantity: 1, imageUrl: "/m/cable-t.jpg" },
			{ title: "Charger", quantity: 2, imageUrl: null },
		]);
	});
});

describe("purchase order reseller card", () => {
	it("shows the supplier the customer order number, the reseller's shop and its hours", async () => {
		const view = await getPurchaseOrderView(
			seed(),
			{ id: "supplier-user", role: "user" },
			"due-today",
			NOW,
		);
		expect(view.reseller).toEqual({
			shopId: "reseller",
			name: "Akwa Tech",
			handle: "akwa-tech",
			phone: "+237699000000",
			level: 2,
			orderNumber: "BNS-2609-000121",
			orderedAt: "2026-10-15T09:48:00.000Z",
			reachable: { from: "08:00", to: "18:00" },
		});
		// The card carries nothing of the end customer.
		const card = JSON.stringify(view.reseller);
		expect(card).not.toContain("Eric");
		expect(card).not.toContain("+237612345678");
		expect(card).not.toContain("buyer-1");
	});

	it("omits the hours when the reseller filed none", async () => {
		const payload = seed();
		payload.store["shop-locations"] = [];
		const view = await getPurchaseOrderView(
			payload,
			{ id: "supplier-user", role: "user" },
			"due-today",
			NOW,
		);
		expect(view.reseller?.reachable).toBeNull();
	});

	it("still refuses a non-party", async () => {
		await expect(
			getPurchaseOrderView(
				seed(),
				{ id: "stranger", role: "user" },
				"due-today",
			),
		).rejects.toMatchObject({ status: 404 });
	});
});
