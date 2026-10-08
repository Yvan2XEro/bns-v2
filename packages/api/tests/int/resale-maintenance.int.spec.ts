// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	enforceResaleTerms,
	refreshResaleLinkStats,
} from "../../src/services/resaleMaintenance";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-04T12:00:00.000Z");

describe("resale maintenance", () => {
	it("holds eligible shops that have not accepted terms by enforcement", async () => {
		const payload = fakePayload({
			shops: [
				{ id: "supplier", status: "active", level: 3 },
				{ id: "reseller", status: "active", level: 2 },
			],
			"resale-terms": [
				{
					id: "supplier-terms",
					role: "supplier",
					version: "2026-08-01",
					publishedAt: "2026-08-01T00:00:00.000Z",
					requiresReacceptance: true,
					enforceAt: "2026-10-01T00:00:00.000Z",
				},
				{
					id: "reseller-terms",
					role: "reseller",
					version: "2026-08-01",
					publishedAt: "2026-08-01T00:00:00.000Z",
					requiresReacceptance: true,
					enforceAt: "2026-10-01T00:00:00.000Z",
				},
			],
			"resale-terms-acceptances": [
				{
					id: "acceptance-1",
					shop: "supplier",
					role: "supplier",
					version: "2026-08-01",
				},
			],
			listings: [
				{
					id: "resale-listing",
					shop: "reseller",
					product: "product-1",
					status: "published",
					resale: {
						supplierShop: "supplier",
						desiredStatus: "published",
						holds: [],
					},
				},
			],
		});

		const held = await enforceResaleTerms(payload, NOW);

		expect(held).toEqual(["reseller:reseller"]);
		expect(payload.store.listings?.[0]).toMatchObject({
			status: "draft",
			resale: { holds: ["terms_not_accepted"] },
		});
	});

	it("repairs link statistics and the product reseller count idempotently", async () => {
		const payload = fakePayload({
			products: [
				{
					id: "product-1",
					shop: "supplier",
					resale: { enabled: true, resellerCount: 0 },
				},
			],
			"resale-links": [
				{
					id: "link-1",
					stats: {
						publishedListings: 0,
						deliveredOrders30d: 0,
						cancelledPurchaseOrders30d: 0,
						refusedDeliveries30d: 0,
					},
				},
			],
			listings: [
				{
					id: "listing-1",
					product: "product-1",
					shop: "reseller",
					status: "published",
					resale: { supplierShop: "supplier", link: "link-1" },
				},
			],
			"purchase-orders": [
				{
					id: "po-1",
					link: "link-1",
					status: "delivered",
					createdAt: "2026-10-03T10:00:00.000Z",
				},
			],
		});

		const first = await refreshResaleLinkStats(payload, NOW);
		const second = await refreshResaleLinkStats(payload, NOW);

		expect(first).toEqual({ linksUpdated: 1, productsRepaired: 1 });
		expect(second).toEqual({ linksUpdated: 0, productsRepaired: 0 });
		expect(payload.store["resale-links"]?.[0]?.stats).toEqual({
			publishedListings: 1,
			deliveredOrders30d: 1,
			cancelledPurchaseOrders30d: 0,
			refusedDeliveries30d: 0,
		});
		expect(payload.store.products?.[0]).toMatchObject({
			resale: { resellerCount: 1 },
		});
	});
});
