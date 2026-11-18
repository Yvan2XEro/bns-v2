// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
	aggregateConversationMetrics,
	aggregateDeliveredCogs,
	aggregateInteractionMetrics,
	aggregateInventorySnapshot,
	aggregateOrderMetrics,
	aggregateResaleMetrics,
	aggregateShopDailyStatsForDay,
	aggregateTopProductOrderMetrics,
	upsertShopDailyStat,
} from "../../src/services/shopDailyAggregation";
import { fakePayload } from "./helpers/fakePayload";

describe("upsertShopDailyStat", () => {
	it("skips an unchanged shop-day row and updates it when a metric changes", async () => {
		const payload = fakePayload();
		const first = await upsertShopDailyStat(payload, {
			shopId: "shop-1",
			date: "2026-10-03",
			metrics: { views: 12, responseBuckets: { m5: 2 } },
			computedAt: "2026-10-04T23:30:00.000Z",
		});
		const repeated = await upsertShopDailyStat(payload, {
			shopId: "shop-1",
			date: "2026-10-03",
			metrics: { responseBuckets: { m5: 2 }, views: 12 },
			computedAt: "2026-10-05T23:30:00.000Z",
		});
		const changed = await upsertShopDailyStat(payload, {
			shopId: "shop-1",
			date: "2026-10-03",
			metrics: { views: 13, responseBuckets: { m5: 2 } },
			computedAt: "2026-10-05T23:30:00.000Z",
		});

		expect(first).toBe("created");
		expect(repeated).toBe("unchanged");
		expect(changed).toBe("updated");
		expect(payload.store["shop-daily-stats"]).toHaveLength(1);
		expect(payload.store["shop-daily-stats"]?.[0]).toMatchObject({
			shop: "shop-1",
			date: "2026-10-03",
			views: 13,
			version: 1,
		});
		expect(
			payload.writes.filter((write) => write.collection === "shop-daily-stats"),
		).toHaveLength(2);
	});
});

describe("aggregateInteractionMetrics", () => {
	it("uses Douala day boundaries and joins each interaction to its listing shop", async () => {
		const payload = fakePayload();
		const rowsByCollection: Record<string, unknown[]> = {
			"listing-view-flushes": [
				{
					_id: { shop: "shop-1", listing: "listing-1", product: "product-1" },
					total: 7,
				},
			],
			favorites: [
				{
					_id: { shop: "shop-1", listing: "listing-1", product: "product-1" },
					total: 2,
				},
			],
			"contact-reveals": [],
			conversations: [],
		};
		const aggregate = vi.fn((pipeline: unknown[]) => {
			const collection = Object.keys(rowsByCollection).find(
				(key) => callsByCollection.get(key) === pipeline,
			);
			return {
				toArray: async () => (collection ? rowsByCollection[collection] : []),
			};
		});
		const callsByCollection = new Map<string, unknown[]>();
		const collections = Object.fromEntries(
			Object.keys(rowsByCollection).map((slug) => [
				slug,
				{
					collection: {
						aggregate: (pipeline: unknown[]) => {
							callsByCollection.set(slug, pipeline);
							return aggregate(pipeline);
						},
					},
				},
			]),
		);
		Object.assign(payload.db, { collections });

		const result = await aggregateInteractionMetrics(payload, "2026-10-04", [
			"shop-1",
		]);

		expect(result.get("shop-1")).toMatchObject({
			views: 7,
			favouritesAdded: 2,
			topProducts: [
				{
					product: "product-1",
					listing: "listing-1",
					views: 7,
				},
			],
		});
		const favoritePipeline = callsByCollection.get("favorites");
		expect(favoritePipeline).toContainEqual({
			$match: {
				createdAt: {
					$gte: new Date("2026-10-03T23:00:00.000Z"),
					$lt: new Date("2026-10-04T23:00:00.000Z"),
				},
			},
		});
		expect(aggregate).toHaveBeenCalledTimes(4);
	});
});

describe("aggregateOrderMetrics", () => {
	it("counts shop order events once and excludes delivery fees from delivered GMV", async () => {
		const payload = fakePayload();
		const eventRows = [
			{
				_id: {
					shop: "shop-1",
					type: "order.delivered",
					actorType: "system",
					reason: null,
					paymentMethod: "cod",
				},
				orders: 1,
				gmvDelivered: 9000,
				unitsDelivered: 2,
			},
			{
				_id: {
					shop: "shop-1",
					type: "order.delivery_failed",
					actorType: "courier",
					reason: "refused",
					paymentMethod: "cod",
				},
				orders: 1,
				gmvDelivered: 0,
				unitsDelivered: 0,
			},
		];
		const collection = {
			aggregate: vi.fn((_pipeline: unknown[]) => ({
				toArray: async () => eventRows,
			})),
		};
		Object.assign(payload.db, {
			collections: { "order-events": { collection } },
		});

		const result = await aggregateOrderMetrics(payload, "2026-10-04", [
			"shop-1",
		]);

		expect(result.get("shop-1")).toMatchObject({
			ordersDelivered: 1,
			gmvDelivered: 9000,
			unitsDelivered: 2,
			codRefused: 1,
		});
		const pipeline = collection.aggregate.mock.calls[0]?.[0];
		expect(pipeline).toContainEqual({
			$lookup: {
				from: "order-items",
				localField: "order",
				foreignField: "order",
				as: "orderItems",
			},
		});
	});
});

describe("aggregateTopProductOrderMetrics", () => {
	it("attributes placed and delivered orders to each fulfilling-shop product", async () => {
		const payload = fakePayload();
		const collection = {
			aggregate: vi.fn((_pipeline: unknown[]) => ({
				toArray: async () => [
					{
						_id: { shop: "shop-1", product: "product-1" },
						listing: "listing-1",
						ordersPlaced: 2,
						unitsDelivered: 3,
						gmvDelivered: 14000,
					},
				],
			})),
		};
		Object.assign(payload.db, {
			collections: { "order-events": { collection } },
		});

		const result = await aggregateTopProductOrderMetrics(
			payload,
			"2026-10-04",
			["shop-1"],
		);

		expect(result.get("shop-1")).toEqual([
			{
				product: "product-1",
				listing: "listing-1",
				ordersPlaced: 2,
				unitsDelivered: 3,
				gmvDelivered: 14000,
				views: 0,
			},
		]);
		expect(collection.aggregate.mock.calls[0]?.[0]).toContainEqual({
			$lookup: {
				from: "order-items",
				localField: "order",
				foreignField: "order",
				as: "orderItems",
			},
		});
	});
});

describe("aggregateShopDailyStatsForDay", () => {
	it("aggregates eligible shops in pages and writes an unchanged-safe daily snapshot", async () => {
		const payload = fakePayload({
			shops: [
				{ id: "shop-1", status: "active" },
				{
					id: "shop-2",
					status: "closed",
					closedAt: "2026-10-02T10:00:00.000Z",
				},
			],
		});
		const aggregateRows: Record<string, unknown[]> = {
			"listing-view-flushes": [
				{
					_id: { shop: "shop-1", listing: "listing-1", product: "product-1" },
					total: 7,
				},
			],
			favorites: [],
			"contact-reveals": [],
			conversations: [],
			"order-events": [
				{
					_id: { shop: "shop-1", type: "order.placed" },
					orders: 1,
				},
			],
			"stock-movements": [],
			"purchase-orders": [],
			"reseller-commissions": [],
		};
		const collections = Object.fromEntries(
			Object.entries(aggregateRows).map(([slug, rows]) => [
				slug,
				{
					collection: {
						aggregate: (_pipeline: unknown[]) => ({
							toArray: async () => rows,
						}),
					},
				},
			]),
		);
		collections.conversations = {
			collection: {
				aggregate: vi.fn((pipeline: unknown[]) => {
					const serialized = JSON.stringify(pipeline);
					if (serialized.includes("messageDoc")) {
						return {
							toArray: async () => [
								{
									shop: "shop-1",
									conversationId: "conversation-1",
									senderSide: "buyer",
									createdAt: "2026-10-04T10:00:00.000Z",
								},
								{
									shop: "shop-1",
									conversationId: "conversation-1",
									senderSide: "shop",
									createdAt: "2026-10-05T10:01:00.000Z",
								},
							],
						};
					}
					if (serialized.includes("awaitingReply")) {
						return { toArray: async () => [{ _id: "shop-1", count: 3 }] };
					}
					return { toArray: async () => [] };
				}),
			},
		};
		Object.assign(payload.db, { collections });

		const first = await aggregateShopDailyStatsForDay(payload, "2026-10-04", {
			computedAt: "2026-10-04T23:30:00.000Z",
			now: new Date("2026-10-04T12:00:00.000Z"),
		});
		const repeat = await aggregateShopDailyStatsForDay(payload, "2026-10-04", {
			computedAt: "2026-10-05T23:30:00.000Z",
			now: new Date("2026-10-04T12:00:00.000Z"),
		});

		expect(first).toMatchObject({
			shopsProcessed: 1,
			created: 1,
			unchanged: 0,
		});
		expect(repeat).toMatchObject({
			shopsProcessed: 1,
			created: 0,
			unchanged: 1,
		});
		expect(payload.store["shop-daily-stats"]).toHaveLength(1);
		expect(payload.store["shop-daily-stats"]?.[0]).toMatchObject({
			shop: "shop-1",
			date: "2026-10-04",
			views: 7,
			ordersPlaced: 1,
			awaitingReply: 3,
			responseBuckets: { over24h: 1 },
		});
	});
});

describe("aggregateInventorySnapshot", () => {
	it("sums only tracked, non-archived stock and computes owner-only value counts", async () => {
		const payload = fakePayload();
		const collection = {
			aggregate: vi.fn((_pipeline: unknown[]) => ({
				toArray: async () => [
					{
						_id: "shop-1",
						inventoryCostValue: 12500,
						outOfStockVariants: 1,
						lowStockVariants: 2,
					},
				],
			})),
		};
		Object.assign(payload.db, {
			collections: { "product-variants": { collection } },
		});

		const result = await aggregateInventorySnapshot(payload, ["shop-1"]);

		expect(result.get("shop-1")).toEqual({
			inventoryCostValue: 12500,
			outOfStockVariants: 1,
			lowStockVariants: 2,
		});
		const pipeline = collection.aggregate.mock.calls[0]?.[0];
		expect(pipeline?.[0]).toMatchObject({ $match: { trackInventory: true } });
		expect(pipeline?.[1]).toHaveProperty("$group.inventoryCostValue");
	});
});

describe("inventory snapshot scope", () => {
	it("captures inventory only for the previous Douala day", async () => {
		const payload = fakePayload({
			shops: [{ id: "shop-1", status: "active" }],
		});
		const inventoryAggregate = vi.fn((_pipeline: unknown[]) => ({
			toArray: async () => [
				{ _id: "shop-1", inventoryCostValue: 6000, lowStockVariants: 1 },
			],
		}));
		const collections = Object.fromEntries(
			[
				"listing-view-flushes",
				"favorites",
				"contact-reveals",
				"conversations",
				"order-events",
				"stock-movements",
				"purchase-orders",
				"reseller-commissions",
			].map((slug) => [
				slug,
				{
					collection: {
						aggregate: (_pipeline: unknown[]) => ({ toArray: async () => [] }),
					},
				},
			]),
		);
		Object.assign(payload.db, {
			collections: {
				...collections,
				"product-variants": { collection: { aggregate: inventoryAggregate } },
			},
		});
		const now = new Date("2026-10-05T00:30:00.000+01:00");

		await aggregateShopDailyStatsForDay(payload, "2026-10-04", { now });
		await aggregateShopDailyStatsForDay(payload, "2026-10-03", { now });

		expect(inventoryAggregate).toHaveBeenCalledTimes(1);
		expect(
			payload.store["shop-daily-stats"]?.find(
				(row) => row.date === "2026-10-04",
			),
		).toMatchObject({ inventoryCostValue: 6000, lowStockVariants: 1 });
		expect(
			payload.store["shop-daily-stats"]?.find(
				(row) => row.date === "2026-10-03",
			),
		).toMatchObject({ inventoryCostValue: 0, lowStockVariants: 0 });
	});

	it("preserves older inventory snapshots while recomputing the last three days", async () => {
		const payload = fakePayload({
			shops: [{ id: "shop-1", status: "active" }],
			"shop-daily-stats": [
				{
					id: "stats-1",
					shop: "shop-1",
					date: "2026-10-03",
					inventoryCostValue: 7200,
					outOfStockVariants: 2,
					lowStockVariants: 4,
				},
			],
		});
		const collections = Object.fromEntries(
			[
				"listing-view-flushes",
				"favorites",
				"contact-reveals",
				"conversations",
				"order-events",
				"stock-movements",
				"purchase-orders",
				"reseller-commissions",
			].map((slug) => [
				slug,
				{
					collection: {
						aggregate: (_pipeline: unknown[]) => ({ toArray: async () => [] }),
					},
				},
			]),
		);
		Object.assign(payload.db, { collections });

		await aggregateShopDailyStatsForDay(payload, "2026-10-03", {
			now: new Date("2026-10-05T00:30:00.000+01:00"),
		});

		expect(payload.store["shop-daily-stats"]?.[0]).toMatchObject({
			inventoryCostValue: 7200,
			outOfStockVariants: 2,
			lowStockVariants: 4,
		});
	});
});

describe("aggregateConversationMetrics", () => {
	it("groups first-response buckets by shop and counts only stale awaiting replies", async () => {
		const payload = fakePayload();
		const collection = {
			aggregate: vi
				.fn()
				.mockImplementationOnce(() => ({
					toArray: async () => [
						{
							shop: "shop-1",
							conversationId: "conversation-1",
							senderSide: "buyer",
							createdAt: "2026-10-04T10:00:00.000Z",
						},
						{
							shop: "shop-1",
							conversationId: "conversation-1",
							senderSide: "shop",
							createdAt: "2026-10-05T10:01:00.000Z",
						},
					],
				}))
				.mockImplementationOnce(() => ({
					toArray: async () => [{ _id: "shop-1", count: 3 }],
				})),
		};
		Object.assign(payload.db, {
			collections: { conversations: { collection } },
		});

		const result = await aggregateConversationMetrics(
			payload,
			"2026-10-04",
			["shop-1"],
			new Date("2026-10-05T12:00:00.000Z"),
		);

		expect(result.get("shop-1")).toMatchObject({
			awaitingReply: 3,
			responseBuckets: {
				over24h: 1,
				unanswered: 0,
			},
		});
		expect(collection.aggregate).toHaveBeenCalledTimes(2);
	});
});

describe("aggregateDeliveredCogs", () => {
	it("prices sale movements at variant cost on the delivered order's Douala day", async () => {
		const payload = fakePayload();
		const collection = {
			aggregate: vi.fn((_pipeline: unknown[]) => ({
				toArray: async () => [{ _id: "shop-1", cogsDelivered: 12000 }],
			})),
		};
		Object.assign(payload.db, {
			collections: { "stock-movements": { collection } },
		});

		const result = await aggregateDeliveredCogs(payload, "2026-10-04", [
			"shop-1",
		]);

		expect(result.get("shop-1")).toBe(12000);
		const pipeline = collection.aggregate.mock.calls[0]?.[0];
		expect(pipeline?.[0]).toMatchObject({ $match: { type: "sale" } });
		expect(pipeline?.[1]).toMatchObject({ $lookup: { from: "order-events" } });
		expect(pipeline?.[3]).toMatchObject({
			$lookup: { from: "product-variants" },
		});
	});
});

describe("aggregateResaleMetrics", () => {
	it("attributes supplier purchase-order events and reseller commissions by event day", async () => {
		const payload = fakePayload();
		const purchaseOrders = {
			aggregate: vi.fn((_pipeline: unknown[]) => ({
				toArray: async () => [
					{
						received: [{ _id: "shop-supplier", count: 2 }],
						acceptedInTime: [{ _id: "shop-supplier", count: 1 }],
						cancelledBySupplier: [{ _id: "shop-supplier", count: 1 }],
						delivered: [{ _id: "shop-reseller", count: 3 }],
					},
				],
			})),
		};
		const commissions = {
			aggregate: vi.fn((_pipeline: unknown[]) => ({
				toArray: async () => [{ _id: "shop-reseller", total: 4500 }],
			})),
		};
		Object.assign(payload.db, {
			collections: {
				"purchase-orders": { collection: purchaseOrders },
				"reseller-commissions": { collection: commissions },
			},
		});

		const result = await aggregateResaleMetrics(payload, "2026-10-04", [
			"shop-supplier",
			"shop-reseller",
		]);

		expect(result.get("shop-supplier")?.resale).toEqual({
			purchaseOrdersReceived: 2,
			purchaseOrdersAcceptedInTime: 1,
			purchaseOrdersCancelledBySupplier: 1,
			resaleDelivered: 0,
			commissionAccrued: 0,
		});
		expect(result.get("shop-reseller")?.resale).toEqual({
			purchaseOrdersReceived: 0,
			purchaseOrdersAcceptedInTime: 0,
			purchaseOrdersCancelledBySupplier: 0,
			resaleDelivered: 3,
			commissionAccrued: 4500,
		});
	});
});
