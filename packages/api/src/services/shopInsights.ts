import type { Payload } from "payload";
import {
	SELLER_CANCELLATION_THRESHOLD,
	sellerCancellationAlert,
} from "../contracts/sellerCancellation";
import { categoryWithDescendants } from "../lib/categoryDescendants";
import { ERROR_CODES } from "../lib/errors";
import { timezoneOfShop } from "../lib/markets";
import { localDateString } from "../lib/marketTime";
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
import {
	dailyResponseMedians,
	type ResponseBurstMessage,
} from "./shopResponseBursts";
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

const WEEKLY_WEEKS = 8;
const COD_REFUSAL_THRESHOLD = 0.2;
const ACCEPTANCE_SAMPLE_LIMIT = 500;

/**
 * Read live off the orders rather than the nightly rows, which do not carry
 * it. `since` is a day before the period's local start so no timezone offset
 * drops an order; the extra day is noise next to a median.
 */
async function acceptanceTimes(
	payload: Payload,
	shopId: string,
	since: number,
): Promise<{ medianMinutes: number | null; sample: number }> {
	const { docs } = await payload.find({
		collection: "orders",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{
					"timestamps.acceptedAt": {
						greater_than_equal: new Date(since).toISOString(),
					},
				},
			],
		},
		sort: "-createdAt",
		limit: ACCEPTANCE_SAMPLE_LIMIT,
		depth: 0,
		overrideAccess: true,
	});
	const minutes = docs
		.flatMap((order) => {
			const accepted = order.timestamps?.acceptedAt;
			const started =
				order.timestamps?.confirmedAt ??
				order.timestamps?.placedAt ??
				order.createdAt;
			if (!accepted || !started) return [];
			const value = (Date.parse(accepted) - Date.parse(started)) / 60_000;
			return Number.isFinite(value) && value >= 0 ? [value] : [];
		})
		.sort((a, b) => a - b);
	if (minutes.length === 0) return { medianMinutes: null, sample: 0 };
	const middle = Math.floor(minutes.length / 2);
	const median =
		minutes.length % 2
			? minutes[middle]
			: ((minutes[middle - 1] ?? 0) + (minutes[middle] ?? 0)) / 2;
	return { medianMinutes: Math.round(median ?? 0), sample: minutes.length };
}

const RESPONSE_CONVERSATION_LIMIT = 500;
const RESPONSE_MESSAGE_LIMIT = 5000;
const SILENCE_MS = 12 * 60 * 60_000;

/**
 * Raw reply times are not stored — the nightly rows keep only buckets — so
 * the per-day medians are recomputed from the messages themselves, with the
 * same burst rule, over the conversations active in the window. Both reads
 * are capped; a shop past the caps gets medians over its latest traffic.
 */
async function responseDaily(
	payload: Payload,
	shopId: string,
	dates: readonly string[],
	timezone: string,
) {
	const first = dates[0];
	if (!first) return [];
	// A day either side of UTC covers every market offset; out-of-window
	// bursts are dropped by date, and the silence before the first one counts.
	const since = new Date(
		Date.parse(`${first}T00:00:00.000Z`) - DAY_MS - SILENCE_MS,
	).toISOString();
	const conversations = await payload.find({
		collection: "conversations",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ lastMessageAt: { greater_than_equal: since } },
			],
		},
		sort: "-lastMessageAt",
		limit: RESPONSE_CONVERSATION_LIMIT,
		depth: 0,
		overrideAccess: true,
	});
	const ids = conversations.docs.map((doc) => String(doc.id));
	if (ids.length === 0) return dailyResponseMedians([], dates, timezone);
	const messages = await payload.find({
		collection: "messages",
		where: {
			and: [
				{ conversation: { in: ids } },
				{ senderSide: { in: ["buyer", "shop"] } },
				{ createdAt: { greater_than_equal: since } },
			],
		},
		sort: "-createdAt",
		limit: RESPONSE_MESSAGE_LIMIT,
		depth: 0,
		overrideAccess: true,
	});
	const rows = messages.docs.flatMap((doc): ResponseBurstMessage[] => {
		const conversationId = relationId(doc.conversation);
		const side = doc.senderSide;
		if (!conversationId || (side !== "buyer" && side !== "shop")) return [];
		return [
			{ conversationId, senderSide: side, createdAt: String(doc.createdAt) },
		];
	});
	return dailyResponseMedians(rows, dates, timezone);
}

const PRICE_SAMPLE_FLOOR = 5;
const PRICE_SAMPLE_LIMIT = 500;

/**
 * The median price of other sellers' published listings in the product's
 * category (subcategories included) and the shop's city. Null under the
 * sample floor: a median of three listings says nothing.
 */
async function priceComparison(
	payload: Payload,
	shopId: string,
	city: string | null,
	product: { productId: string; listingId: string | null },
) {
	if (!city || !product.listingId) return null;
	const listing = await payload
		.findByID({
			collection: "listings",
			id: product.listingId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const yourPrice = listing?.price ?? listing?.productSummary?.priceMin ?? null;
	const categoryId = relationId(listing?.category);
	if (!listing || yourPrice === null || !categoryId) return null;
	const categories = await categoryWithDescendants(payload, categoryId);
	const similar = await payload.find({
		collection: "listings",
		where: {
			and: [
				{ status: { equals: "published" } },
				{ category: { in: categories } },
				{ location: { like: city } },
				{ shop: { not_equals: shopId } },
				{ price: { greater_than: 0 } },
			],
		},
		sort: "-createdAt",
		limit: PRICE_SAMPLE_LIMIT,
		depth: 0,
		overrideAccess: true,
	});
	const prices = similar.docs
		.map((doc) => Number(doc.price))
		.filter((price) => Number.isFinite(price) && price > 0)
		.sort((a, b) => a - b);
	if (prices.length < PRICE_SAMPLE_FLOOR) return null;
	const middle = Math.floor(prices.length / 2);
	const median =
		prices.length % 2
			? (prices[middle] ?? 0)
			: ((prices[middle - 1] ?? 0) + (prices[middle] ?? 0)) / 2;
	return {
		productId: product.productId,
		medianPrice: Math.round(median),
		yourPrice,
		sample: prices.length,
	};
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
	const shop = await payload.findByID({
		collection: "shops",
		id: shopId,
		depth: 0,
		overrideAccess: true,
	});
	const timezone = await timezoneOfShop(payload, shop);
	const end = localDateString(options.now ?? new Date(), timezone);
	const currentStart = addDays(end, 1 - days);
	const previousStart = addDays(currentStart, -days);
	const weeklyStart = addDays(end, 1 - WEEKLY_WEEKS * 7);
	const stats = await payload.find({
		collection: "shop-daily-stats",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{
					date: {
						greater_than_equal:
							weeklyStart < previousStart ? weeklyStart : previousStart,
					},
				},
				{ date: { less_than_equal: end } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const rows = stats.docs;
	const previousRows = rows.filter(
		(row) => row.date >= previousStart && row.date < currentStart,
	);
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
	const { availableByProduct, ...stockInsights } = await getShopStockInsights(
		payload,
		shopId,
		options.now ?? new Date(),
		timezone,
		String(user.id),
	);
	const topProducts = currentTopProducts.map((product) => ({
		...product,
		productTitle: productTitles.get(product.productId) ?? product.productId,
		available: availableByProduct[product.productId] ?? null,
	}));
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
	if (codShipped >= 5 && codRefused / codShipped >= COD_REFUSAL_THRESHOLD) {
		actions.push({
			type: "cod_refusal_rate",
			href: "/seller/orders?status=shipped",
		});
	}
	if (sellerCancellationAlert(sellerCancellations, current.ordersPlaced)) {
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
	const weekly = Array.from({ length: WEEKLY_WEEKS }, (_, index) => {
		const from = addDays(weeklyStart, index * 7);
		const to = addDays(from, 6);
		const week = rows.filter((row) => row.date >= from && row.date <= to);
		return {
			from,
			to,
			gmvDelivered: week.reduce(
				(sum, row) => sum + Number(row.gmvDelivered ?? 0),
				0,
			),
			ordersDelivered: week.reduce(
				(sum, row) => sum + Number(row.ordersDelivered ?? 0),
				0,
			),
		};
	});
	const responseDays = period === "7d" ? 7 : 14;
	const responseByDay = await responseDaily(
		payload,
		shopId,
		Array.from({ length: responseDays }, (_, index) =>
			addDays(end, index + 1 - responseDays),
		),
		timezone,
	);
	const comparison = lowConversion
		? await priceComparison(
				payload,
				shopId,
				shop.location?.city ?? null,
				lowConversion,
			)
		: null;
	const acceptance = await acceptanceTimes(
		payload,
		shopId,
		new Date(`${currentStart}T00:00:00.000Z`).getTime() - DAY_MS,
	);
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
			priceComparison: comparison,
		},
		rateCounts: {
			sellerCancellations,
			ordersPlaced: current.ordersPlaced,
			codRefused,
			codShipped,
		},
		thresholds: {
			sellerCancellation: SELLER_CANCELLATION_THRESHOLD,
			codRefusal: COD_REFUSAL_THRESHOLD,
		},
		acceptance,
		weekly,
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
			daily: responseByDay,
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
