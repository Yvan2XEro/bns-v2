// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getShopInsights } from "../../src/services/shopInsights";
import { fakePayload } from "./helpers/fakePayload";

describe("getShopInsights", () => {
	it("suppresses rates when their denominator is below five", async () => {
		const payload = fakePayload(
			{
				shops: [{ id: "shop-1", owner: "owner-1", status: "active", level: 2 }],
				"shop-members": [
					{
						id: "member-1",
						shop: "shop-1",
						user: "owner-1",
						role: "owner",
						status: "active",
					},
				],
				"shop-daily-stats": [
					{
						id: "current",
						shop: "shop-1",
						date: "2026-10-04",
						views: 4,
						ordersPlaced: 2,
						ordersAccepted: 1,
						ordersDelivered: 1,
						codShipped: 4,
						codRefused: 2,
					},
				],
			},
			{ globals: { "app-settings": { insights: { enabled: true } } } },
		);

		const result = await getShopInsights(
			payload,
			{ id: "owner-1", role: "user" },
			"shop-1",
			"7d",
			{ now: new Date("2026-10-04T12:00:00.000Z") },
		);

		expect(result.funnel.conversion).toBeNull();
		expect(result.rates).toEqual({
			sellerCancellation: null,
			codRefusal: null,
			deliveryCompletion: null,
		});
	});

	it("aggregates the selected Douala window, deltas, funnel, rates and product ranking", async () => {
		const payload = fakePayload(
			{
				shops: [
					{
						id: "shop-1",
						owner: "owner-1",
						status: "active",
						level: 2,
					},
				],
				"shop-members": [
					{
						id: "member-1",
						shop: "shop-1",
						user: "owner-1",
						role: "owner",
						status: "active",
					},
				],
				products: [
					{
						id: "product-1",
						shop: "shop-1",
						title: "Product one",
						status: "active",
					},
					{
						id: "product-2",
						shop: "shop-1",
						title: "Product two",
						status: "active",
					},
				],
				"product-variants": [
					{
						id: "variant-1",
						shop: "shop-1",
						product: "product-1",
						trackInventory: true,
						stockOnHand: 10,
						stockReserved: 8,
					},
					{
						id: "variant-2",
						shop: "shop-1",
						product: "product-2",
						trackInventory: true,
						stockOnHand: 5,
						stockReserved: 5,
					},
				],
				"shop-daily-stats": [
					{
						id: "current-1",
						shop: "shop-1",
						date: "2026-10-04",
						views: 100,
						phoneReveals: 10,
						conversationsStarted: 20,
						ordersPlaced: 8,
						ordersAccepted: 6,
						ordersDelivered: 4,
						ordersCancelledBySeller: 1,
						codShipped: 5,
						codRefused: 1,
						gmvDelivered: 40000,
						unitsDelivered: 5,
						cogsDelivered: 20000,
						inventoryCostValue: 100000,
						responseBuckets: {
							m5: 0,
							m15: 0,
							h1: 0,
							h4: 4,
							unanswered: 1,
						},
						topProducts: [
							{
								product: "product-1",
								listing: "listing-1",
								views: 90,
								ordersPlaced: 1,
								unitsDelivered: 100,
								gmvDelivered: 10000,
							},
							{
								product: "product-1",
								listing: "listing-1",
								views: 200,
								ordersPlaced: 0,
								unitsDelivered: 0,
								gmvDelivered: 0,
							},
							{
								product: "product-2",
								listing: "listing-2",
								views: 10,
								ordersPlaced: 7,
								unitsDelivered: 3,
								gmvDelivered: 30000,
							},
						],
					},
					{
						id: "previous-1",
						shop: "shop-1",
						date: "2026-09-27",
						views: 50,
						conversationsStarted: 5,
						ordersPlaced: 2,
						ordersDelivered: 1,
						gmvDelivered: 10000,
						unitsDelivered: 1,
					},
				],
			},
			{ globals: { "app-settings": { insights: { enabled: true } } } },
		);

		const result = await getShopInsights(
			payload,
			{ id: "owner-1", role: "user" },
			"shop-1",
			"7d",
			{ now: new Date("2026-10-04T12:00:00.000Z") },
		);

		expect(result.totals.current).toMatchObject({
			views: 100,
			conversationsStarted: 20,
			ordersPlaced: 8,
			ordersDelivered: 4,
			gmvDelivered: 40000,
			unitsDelivered: 5,
		});
		expect(result.totals.previous.views).toBe(50);
		expect(result.totals.delta.views).toBe(50);
		expect(result.from).toBe("2026-09-28");
		expect(result.daily).toHaveLength(7);
		expect(result.daily[0]).toMatchObject({
			date: "2026-09-28",
			views: 0,
			ordersPlaced: 0,
			gmvDelivered: 0,
		});
		expect(result.funnel).toMatchObject({
			views: 100,
			engaged: 30,
			ordersPlaced: 8,
			ordersDelivered: 4,
			conversion: 0.08,
		});
		expect(result.rates).toMatchObject({
			sellerCancellation: 0.125,
			codRefusal: 0.2,
			deliveryCompletion: 2 / 3,
		});
		expect(result.responseTime.medianBucket).toBe("h4");
		expect(result.actions.map((action) => action.type)).toEqual([
			"out_of_stock_views",
			"restock",
			"cod_refusal_rate",
			"seller_cancellation_rate",
		]);
		expect(result.actions).toHaveLength(4);
		expect(result.topProducts.map((product) => product.productId)).toEqual([
			"product-2",
			"product-1",
		]);
		expect(result.topProducts.map((product) => product.productTitle)).toEqual([
			"Product two",
			"Product one",
		]);
		expect(result.stock.restock).toContainEqual(
			expect.objectContaining({
				variantId: "variant-1",
				available: 2,
				daysOfCover: 0.6,
			}),
		);
		expect(result.stock.outOfStockWithViews).toContainEqual(
			expect.objectContaining({ variantId: "variant-2", views: 10 }),
		);
	});

	it("fails closed when insights are disabled and refuses staff access", async () => {
		const payload = fakePayload(
			{
				shops: [{ id: "shop-1", owner: "owner-1", status: "active", level: 2 }],
				"shop-members": [
					{
						id: "staff",
						shop: "shop-1",
						user: "staff-user",
						role: "staff",
						status: "active",
					},
				],
			},
			{ globals: { "app-settings": { insights: { enabled: false } } } },
		);
		await expect(
			getShopInsights(payload, { id: "owner-1", role: "user" }, "shop-1", "7d"),
		).rejects.toMatchObject({ status: 404 });
		payload.globals["app-settings"].insights = { enabled: true };
		await expect(
			getShopInsights(
				payload,
				{ id: "staff-user", role: "user" },
				"shop-1",
				"7d",
			),
		).rejects.toMatchObject({ status: 403 });
	});
});
