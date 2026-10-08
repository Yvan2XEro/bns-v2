import type { Payload } from "payload";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import type { ShopDailyStat } from "../payload-types";
import type {
	InsightsPeriod,
	ResponseBucket,
	ShopInsightsView,
} from "../types/shopInsights";
import { requireShopPermission } from "./shopGuards";
import { getShopStockInsights } from "./shopInsightsStock";
import type { ServiceUser } from "./shops";

type MetricTotals = {
	views: number;
	conversationsStarted: number;
	ordersPlaced: number;
	ordersDelivered: number;
	gmvDelivered: number;
	unitsDelivered: number;
};

const PERIOD_DAYS: Record<InsightsPeriod, number> = {
	"7d": 7,
	"30d": 30,
	"90d": 90,
};
const METRIC_KEYS = [
	"views",
	"conversationsStarted",
	"ordersPlaced",
	"ordersDelivered",
	"gmvDelivered",
	"unitsDelivered",
] as const satisfies readonly (keyof MetricTotals)[];
const RESPONSE_BUCKETS: readonly ResponseBucket[] = [
	"m5",
	"m15",
	"h1",
	"h4",
	"h24",
	"over24h",
];
const DAY_MS = 86_400_000;

function dateInDouala(now: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Africa/Douala",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

function addDays(day: string, amount: number): string {
	const date = new Date(`${day}T00:00:00.000Z`);
	date.setTime(date.getTime() + amount * DAY_MS);
	return date.toISOString().slice(0, 10);
}

function sumRows(rows: ShopDailyStat[]): MetricTotals {
	return rows.reduce<MetricTotals>(
		(totals, row) => {
			for (const key of METRIC_KEYS) totals[key] += Number(row[key] ?? 0);
			return totals;
		},
		{
			views: 0,
			conversationsStarted: 0,
			ordersPlaced: 0,
			ordersDelivered: 0,
			gmvDelivered: 0,
			unitsDelivered: 0,
		},
	);
}

function rate(
	numerator: number,
	denominator: number,
	minimumDenominator = 5,
): number | null {
	return denominator >= minimumDenominator ? numerator / denominator : null;
}

function medianResponseBucket(rows: ShopDailyStat[]): ResponseBucket | null {
	const counts = new Map<ResponseBucket, number>();
	let total = 0;
	for (const row of rows) {
		for (const bucket of RESPONSE_BUCKETS) {
			const count = Number(row.responseBuckets?.[bucket] ?? 0);
			counts.set(bucket, (counts.get(bucket) ?? 0) + count);
			total += count;
		}
	}
	if (total === 0) return null;
	const midpoint = Math.ceil(total / 2);
	let cumulative = 0;
	for (const bucket of RESPONSE_BUCKETS) {
		cumulative += counts.get(bucket) ?? 0;
		if (cumulative >= midpoint) return bucket;
	}
	return "over24h";
}

function metricsDelta(current: MetricTotals, previous: MetricTotals) {
	return Object.fromEntries(
		METRIC_KEYS.map((key) => [key, current[key] - previous[key]]),
	) as MetricTotals;
}

function aggregateTopProducts(rows: ShopDailyStat[]) {
	const products = new Map<
		string,
		{
			productId: string;
			listingId: string | null;
			views: number;
			ordersPlaced: number;
			unitsDelivered: number;
			gmvDelivered: number;
		}
	>();
	for (const row of rows) {
		for (const entry of row.topProducts ?? []) {
			const productId = relationId(entry.product);
			if (!productId) continue;
			const current = products.get(productId) ?? {
				productId,
				listingId: relationId(entry.listing),
				views: 0,
				ordersPlaced: 0,
				unitsDelivered: 0,
				gmvDelivered: 0,
			};
			current.views += Number(entry.views ?? 0);
			current.ordersPlaced += Number(entry.ordersPlaced ?? 0);
			current.unitsDelivered += Number(entry.unitsDelivered ?? 0);
			current.gmvDelivered += Number(entry.gmvDelivered ?? 0);
			products.set(productId, current);
		}
	}
	return [...products.values()]
		.sort((a, b) => b.gmvDelivered - a.gmvDelivered || b.views - a.views)
		.slice(0, 5);
}

export async function getShopInsights(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	period: InsightsPeriod,
	options: { now?: Date } = {},
): Promise<ShopInsightsView> {
	let enabled = false;
	try {
		const settings = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
		});
		enabled = settings.insights?.enabled === true;
	} catch {
		enabled = false;
	}
	if (!enabled) throw new ServiceError(ERROR_CODES.notFound, 404);
	await requireShopPermission(payload, user, shopId, "costs.view");

	const days = PERIOD_DAYS[period];
	const end = dateInDouala(options.now ?? new Date());
	const currentStart = addDays(end, 1 - days);
	const previousStart = addDays(currentStart, -days);
	const stats = await payload.find({
		collection: "shop-daily-stats",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ date: { greater_than_equal: previousStart } },
				{ date: { less_than_equal: end } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const rows = stats.docs;
	const previousRows = rows.filter((row) => row.date < currentStart);
	const currentRows = rows.filter((row) => row.date >= currentStart);
	const current = sumRows(currentRows);
	const previous = sumRows(previousRows);
	const responseRows = currentRows;
	const responseBucketTotals = RESPONSE_BUCKETS.reduce(
		(totals, key) =>
			totals +
			Number(
				responseRows.reduce(
					(sum, row) => sum + Number(row.responseBuckets?.[key] ?? 0),
					0,
				),
			),
		0,
	);
	const withinOneHour = ["m5", "m15", "h1"] as const;
	const quickResponses = responseRows.reduce(
		(sum, row) =>
			sum +
			withinOneHour.reduce(
				(bucketSum, key) => bucketSum + Number(row.responseBuckets?.[key] ?? 0),
				0,
			),
		0,
	);
	const awaitingReply = await payload.count({
		collection: "conversations",
		where: {
			and: [{ shop: { equals: shopId } }, { awaitingReply: { equals: true } }],
		},
		overrideAccess: true,
	});
	const buckets = RESPONSE_BUCKETS.reduce(
		(result, key) => {
			result[key] = responseRows.reduce(
				(sum, row) => sum + Number(row.responseBuckets?.[key] ?? 0),
				0,
			);
			return result;
		},
		{} as Record<ResponseBucket, number>,
	);
	const medianBucket = medianResponseBucket(currentRows);
	const sellerCancellations = currentRows.reduce(
		(sum, row) => sum + Number(row.ordersCancelledBySeller ?? 0),
		0,
	);
	const codShipped = currentRows.reduce(
		(sum, row) => sum + Number(row.codShipped ?? 0),
		0,
	);
	const codRefused = currentRows.reduce(
		(sum, row) => sum + Number(row.codRefused ?? 0),
		0,
	);
	const currentTopProducts = aggregateTopProducts(currentRows);
	const productIds = currentTopProducts.map((product) => product.productId);
	const products = productIds.length
		? await payload.find({
				collection: "products",
				where: {
					and: [{ shop: { equals: shopId } }, { id: { in: productIds } }],
				},
				limit: productIds.length,
				pagination: false,
				depth: 0,
				overrideAccess: true,
			})
		: { docs: [] };
	const productTitles = new Map(
		products.docs.map((product) => [product.id, product.title]),
	);
	const topProducts = currentTopProducts.map((product) => ({
		...product,
		productTitle: productTitles.get(product.productId) ?? product.productId,
	}));
	const stockInsights = await getShopStockInsights(
		payload,
		shopId,
		options.now ?? new Date(),
	);
	const totalResponseBuckets = responseBucketTotals;
	const answeredWithinOneHour =
		totalResponseBuckets > 0 ? quickResponses / totalResponseBuckets : null;
	const actions: Array<{
		type:
			| "awaiting_reply"
			| "out_of_stock_views"
			| "restock"
			| "cod_refusal_rate"
			| "seller_cancellation_rate"
			| "low_conversion"
			| "slow_response";
		href: string;
		count?: number;
		productId?: string;
	}> = [];
	if (awaitingReply.totalDocs > 0) {
		actions.push({
			type: "awaiting_reply",
			href: "/seller/messages",
			count: awaitingReply.totalDocs,
		});
	}
	if (stockInsights.outOfStockWithViews.length > 0) {
		actions.push({
			type: "out_of_stock_views",
			href: "/seller/catalogue?tab=stock",
			count: stockInsights.outOfStockWithViews.length,
		});
	}
	if (stockInsights.restock.length > 0) {
		actions.push({
			type: "restock",
			href: "/seller/catalogue?tab=stock",
			productId: stockInsights.restock[0]?.productId,
		});
	}
	if (codShipped >= 5 && codRefused / codShipped >= 0.2) {
		actions.push({
			type: "cod_refusal_rate",
			href: "/seller/orders?status=shipped",
		});
	}
	if (
		current.ordersPlaced >= 5 &&
		sellerCancellations / current.ordersPlaced >= 0.1
	) {
		actions.push({
			type: "seller_cancellation_rate",
			href: "/seller/catalogue",
		});
	}
	const lowConversion = currentTopProducts.find(
		(product) =>
			product.views >= 200 && product.ordersPlaced / product.views < 0.005,
	);
	if (lowConversion) {
		actions.push({
			type: "low_conversion",
			href: `/seller/catalogue/${encodeURIComponent(lowConversion.productId)}`,
			productId: lowConversion.productId,
		});
	}
	if (
		medianBucket === "h4" ||
		medianBucket === "h24" ||
		medianBucket === "over24h"
	) {
		actions.push({ type: "slow_response", href: "/account/notifications" });
	}

	const dailyByDate = new Map(currentRows.map((row) => [row.date, row]));
	const daily = Array.from({ length: days }, (_, index) => {
		const date = addDays(currentStart, index);
		const row = dailyByDate.get(date);
		return {
			date,
			views: Number(row?.views ?? 0),
			ordersPlaced: Number(row?.ordersPlaced ?? 0),
			gmvDelivered: Number(row?.gmvDelivered ?? 0),
		};
	});
	const cogsDelivered = currentRows.reduce(
		(sum, row) => sum + Number(row.cogsDelivered ?? 0),
		0,
	);
	const inventorySnapshots = currentRows
		.map((row) => row.inventoryCostValue)
		.filter((value): value is number => typeof value === "number");
	const averageInventoryCost = inventorySnapshots.length
		? inventorySnapshots.reduce((sum, value) => sum + value, 0) /
			inventorySnapshots.length
		: 0;
	const actionsLimited = actions.slice(0, 4);
	return {
		period,
		from: currentStart,
		to: end,
		totals: {
			current,
			previous,
			delta: metricsDelta(current, previous),
		},
		funnel: {
			views: current.views,
			engaged: currentRows.reduce(
				(sum, row) =>
					sum +
					Number(row.conversationsStarted ?? 0) +
					Number(row.phoneReveals ?? 0),
				0,
			),
			ordersPlaced: current.ordersPlaced,
			ordersDelivered: current.ordersDelivered,
			conversion: rate(current.ordersPlaced, current.views),
		},
		rates: {
			sellerCancellation: rate(sellerCancellations, current.ordersPlaced),
			codRefusal: rate(codRefused, codShipped),
			deliveryCompletion: rate(
				current.ordersDelivered,
				currentRows.reduce(
					(sum, row) => sum + Number(row.ordersAccepted ?? 0),
					0,
				),
			),
		},
		responseTime: {
			medianBucket,
			answeredWithinOneHour,
			awaitingReply: awaitingReply.totalDocs,
			buckets,
		},
		daily,
		topProducts,
		stock: {
			turnover: rate(cogsDelivered, averageInventoryCost, 1),
			...stockInsights,
		},
		actions: actionsLimited,
	};
}

export type { InsightsPeriod, ShopInsightsView } from "../types/shopInsights";
