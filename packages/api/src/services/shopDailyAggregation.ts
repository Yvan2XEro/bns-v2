import { createHash } from "node:crypto";
import type { MongooseAdapter } from "@payloadcms/db-mongodb";
import { type Document, ObjectId } from "mongodb";
import type { Payload } from "payload";
import { relationId } from "../lib/relationId";
import type { ShopDailyStat } from "../payload-types";
import {
	aggregateResponseBuckets,
	type ResponseBurstMessage,
} from "./shopResponseBursts";

type DailyMetricValues = Omit<
	ShopDailyStat,
	| "id"
	| "shop"
	| "date"
	| "computedAt"
	| "version"
	| "metricsHash"
	| "createdAt"
	| "updatedAt"
>;

type InteractionSource = {
	slug:
		| "listing-view-flushes"
		| "favorites"
		| "contact-reveals"
		| "conversations";
	field: "views" | "favouritesAdded" | "phoneReveals" | "conversationsStarted";
	byDayField: "date" | "createdAt";
};

const INTERACTION_SOURCES: readonly InteractionSource[] = [
	{ slug: "listing-view-flushes", field: "views", byDayField: "date" },
	{ slug: "favorites", field: "favouritesAdded", byDayField: "createdAt" },
	{ slug: "contact-reveals", field: "phoneReveals", byDayField: "createdAt" },
	{
		slug: "conversations",
		field: "conversationsStarted",
		byDayField: "createdAt",
	},
];

type AggregateRow = {
	_id?: { shop?: unknown; listing?: unknown; product?: unknown } | null;
	total?: unknown;
};

function storedId(value: string): unknown {
	try {
		return new ObjectId(value);
	} catch {
		return value;
	}
}

export function doualaDayWindow(date: string): { start: Date; end: Date } {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
		throw new Error("A shop-stat date must be YYYY-MM-DD.");
	const start = new Date(`${date}T00:00:00.000+01:00`);
	if (
		Number.isNaN(start.getTime()) ||
		(start.toISOString().slice(0, 10) !== date && start.getUTCHours() !== 23)
	)
		throw new Error("Invalid shop-stat date.");
	return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function previousDoualaDate(now: Date): string {
	const today = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Africa/Douala",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	const previous = new Date(`${today}T12:00:00.000Z`);
	previous.setUTCDate(previous.getUTCDate() - 1);
	return previous.toISOString().slice(0, 10);
}

function interactionPipeline(
	source: InteractionSource,
	date: string,
	shopIds: readonly string[],
): Document[] {
	const window = doualaDayWindow(date);
	const match =
		source.byDayField === "date"
			? { date }
			: { createdAt: { $gte: window.start, $lt: window.end } };
	return [
		{ $match: match },
		{
			$lookup: {
				from: "listings",
				localField: "listing",
				foreignField: "_id",
				as: "listingDoc",
			},
		},
		{ $unwind: "$listingDoc" },
		{ $match: { "listingDoc.shop": { $in: shopIds.map(storedId) } } },
		{
			$group: {
				_id: {
					shop: "$listingDoc.shop",
					listing: "$listingDoc._id",
					product: "$listingDoc.product",
				},
				total: {
					$sum: source.field === "views" ? "$views" : 1,
				},
			},
		},
	];
}

async function aggregateRows(
	payload: Payload,
	slug: InteractionSource["slug"],
	pipeline: Document[],
): Promise<AggregateRow[]> {
	const adapter = payload.db as unknown as MongooseAdapter;
	const collection = adapter.collections[slug]?.collection;
	if (!collection)
		throw new Error(`Mongo collection '${slug}' is unavailable.`);
	return collection.aggregate<AggregateRow>(pipeline).toArray();
}

export async function aggregateInteractionMetrics(
	payload: Payload,
	date: string,
	shopIds: readonly string[],
): Promise<Map<string, DailyMetricValues>> {
	const grouped = await Promise.all(
		INTERACTION_SOURCES.map(async (source) => ({
			source,
			rows: await aggregateRows(
				payload,
				source.slug,
				interactionPipeline(source, date, shopIds),
			),
		})),
	);
	const metrics = new Map<string, DailyMetricValues>();
	const forShop = (shopId: string): DailyMetricValues => {
		const current = metrics.get(shopId) ?? {
			views: 0,
			favouritesAdded: 0,
			phoneReveals: 0,
			conversationsStarted: 0,
			topProducts: [],
		};
		metrics.set(shopId, current);
		return current;
	};
	for (const { source, rows } of grouped) {
		for (const row of rows) {
			const shopId = row._id?.shop == null ? null : String(row._id.shop);
			if (!shopId) continue;
			const total = Number(row.total ?? 0);
			if (!Number.isSafeInteger(total) || total < 0) continue;
			const shopMetrics = forShop(shopId);
			shopMetrics[source.field] =
				Number(shopMetrics[source.field] ?? 0) + total;
			if (source.field !== "views") continue;
			const listingId =
				row._id?.listing == null ? null : String(row._id.listing);
			const productId =
				row._id?.product == null ? null : String(row._id.product);
			if (!listingId || !productId) continue;
			const products = shopMetrics.topProducts ?? [];
			const existing = products.find(
				(product) => String(product.product) === productId,
			);
			if (existing) existing.views = Number(existing.views ?? 0) + total;
			else {
				products.push({
					product: productId,
					listing: listingId,
					views: total,
					ordersPlaced: 0,
					unitsDelivered: 0,
					gmvDelivered: 0,
				});
			}
			shopMetrics.topProducts = products;
		}
	}
	return metrics;
}

type OrderAggregateRow = {
	_id?: {
		shop?: unknown;
		type?: unknown;
		actorType?: unknown;
		reason?: unknown;
		paymentMethod?: unknown;
	} | null;
	orders?: unknown;
	gmvDelivered?: unknown;
	unitsDelivered?: unknown;
};

const SHOP_FAULT_REASONS = new Set([
	"seller_out_of_stock",
	"seller_cannot_deliver",
	"seller_buyer_unreachable",
	"seller_other",
	"seller_timeout",
	"confirmation_expired",
]);

function orderEventsPipeline(
	date: string,
	shopIds: readonly string[],
): Document[] {
	const window = doualaDayWindow(date);
	return [
		{
			$match: {
				createdAt: { $gte: window.start, $lt: window.end },
				type: {
					$in: [
						"order.placed",
						"order.confirmed",
						"order.paid",
						"order.accepted",
						"order.delivered",
						"order.cancelled",
						"order.declined",
						"order.shipped",
						"order.delivery_failed",
					],
				},
			},
		},
		{
			$lookup: {
				from: "orders",
				localField: "order",
				foreignField: "_id",
				as: "orderDoc",
			},
		},
		{ $unwind: "$orderDoc" },
		{
			$lookup: {
				from: "order-items",
				localField: "order",
				foreignField: "order",
				as: "orderItems",
			},
		},
		{ $unwind: "$orderItems" },
		{ $match: { "orderItems.fulfillingShop": { $in: shopIds.map(storedId) } } },
		{
			$group: {
				_id: {
					event: "$_id",
					shop: "$orderItems.fulfillingShop",
					type: "$type",
					actorType: "$actorType",
					reason: "$reason",
					paymentMethod: "$orderDoc.paymentMethod",
				},
				orders: { $first: 1 },
				gmvDelivered: {
					$sum: {
						$cond: [
							{ $eq: ["$type", "order.delivered"] },
							{ $ifNull: ["$orderItems.lineSubtotal", 0] },
							0,
						],
					},
				},
				unitsDelivered: {
					$sum: {
						$cond: [
							{ $eq: ["$type", "order.delivered"] },
							{ $ifNull: ["$orderItems.quantity", 0] },
							0,
						],
					},
				},
			},
		},
		{
			$group: {
				_id: {
					shop: "$_id.shop",
					type: "$_id.type",
					actorType: "$_id.actorType",
					reason: "$_id.reason",
					paymentMethod: "$_id.paymentMethod",
				},
				orders: { $sum: "$orders" },
				gmvDelivered: { $sum: "$gmvDelivered" },
				unitsDelivered: { $sum: "$unitsDelivered" },
			},
		},
	];
}

export async function aggregateOrderMetrics(
	payload: Payload,
	date: string,
	shopIds: readonly string[],
): Promise<Map<string, DailyMetricValues>> {
	const adapter = payload.db as unknown as MongooseAdapter;
	const collection = adapter.collections["order-events"]?.collection;
	if (!collection)
		throw new Error("Mongo collection 'order-events' is unavailable.");
	const rows = await collection
		.aggregate<OrderAggregateRow>(orderEventsPipeline(date, shopIds))
		.toArray();
	const metrics = new Map<string, DailyMetricValues>();
	for (const row of rows) {
		const id = row._id;
		const shopId = id?.shop == null ? null : String(id.shop);
		if (!shopId) continue;
		const count = Number(row.orders ?? 0);
		if (!Number.isSafeInteger(count) || count < 0) continue;
		const current = metrics.get(shopId) ?? {};
		const type = id?.type;
		if (type === "order.placed")
			current.ordersPlaced = Number(current.ordersPlaced ?? 0) + count;
		if (type === "order.confirmed" || type === "order.paid")
			current.ordersConfirmed = Number(current.ordersConfirmed ?? 0) + count;
		if (type === "order.accepted")
			current.ordersAccepted = Number(current.ordersAccepted ?? 0) + count;
		if (type === "order.delivered") {
			current.ordersDelivered = Number(current.ordersDelivered ?? 0) + count;
			current.gmvDelivered =
				Number(current.gmvDelivered ?? 0) + Number(row.gmvDelivered ?? 0);
			current.unitsDelivered =
				Number(current.unitsDelivered ?? 0) + Number(row.unitsDelivered ?? 0);
		}
		if (
			(type === "order.cancelled" || type === "order.declined") &&
			(id?.actorType === "seller" ||
				(id?.actorType === "system" &&
					typeof id.reason === "string" &&
					SHOP_FAULT_REASONS.has(id.reason)))
		) {
			current.ordersCancelledBySeller =
				Number(current.ordersCancelledBySeller ?? 0) + count;
		}
		if (type === "order.cancelled" && id?.actorType === "buyer")
			current.ordersCancelledByBuyer =
				Number(current.ordersCancelledByBuyer ?? 0) + count;
		if (type === "order.shipped" && id?.paymentMethod === "cod")
			current.codShipped = Number(current.codShipped ?? 0) + count;
		if (
			type === "order.delivery_failed" &&
			id?.paymentMethod === "cod" &&
			(id.reason === "refused" || id.reason === "unreachable")
		) {
			current.codRefused = Number(current.codRefused ?? 0) + count;
		}
		metrics.set(shopId, current);
	}
	return metrics;
}

type TopProductOrderRow = {
	_id?: { shop?: unknown; product?: unknown } | null;
	listing?: unknown;
	ordersPlaced?: unknown;
	unitsDelivered?: unknown;
	gmvDelivered?: unknown;
};

export async function aggregateTopProductOrderMetrics(
	payload: Payload,
	date: string,
	shopIds: readonly string[],
): Promise<Map<string, NonNullable<DailyMetricValues["topProducts"]>>> {
	const adapter = payload.db as unknown as MongooseAdapter;
	const collection = adapter.collections["order-events"]?.collection;
	if (!collection)
		throw new Error("Mongo collection 'order-events' is unavailable.");
	const { start, end } = doualaDayWindow(date);
	const rows = await collection.aggregate<TopProductOrderRow>([
		{
			$match: {
				createdAt: { $gte: start, $lt: end },
				type: { $in: ["order.placed", "order.delivered"] },
			},
		},
		{
			$lookup: {
				from: "order-items",
				localField: "order",
				foreignField: "order",
				as: "orderItems",
			},
		},
		{ $unwind: "$orderItems" },
		{
			$match: {
				"orderItems.fulfillingShop": { $in: shopIds.map(storedId) },
			},
		},
		{
			$group: {
				_id: {
					event: "$_id",
					order: "$order",
					shop: "$orderItems.fulfillingShop",
					product: "$orderItems.product",
					listing: "$orderItems.listing",
					type: "$type",
				},
				ordersPlaced: {
					$first: { $cond: [{ $eq: ["$type", "order.placed"] }, 1, 0] },
				},
				unitsDelivered: {
					$sum: {
						$cond: [
							{ $eq: ["$type", "order.delivered"] },
							{ $ifNull: ["$orderItems.quantity", 0] },
							0,
						],
					},
				},
				gmvDelivered: {
					$sum: {
						$cond: [
							{ $eq: ["$type", "order.delivered"] },
							{ $ifNull: ["$orderItems.lineSubtotal", 0] },
							0,
						],
					},
				},
			},
		},
		{
			$group: {
				_id: { shop: "$_id.shop", product: "$_id.product" },
				listing: { $first: "$_id.listing" },
				ordersPlaced: { $sum: "$ordersPlaced" },
				unitsDelivered: { $sum: "$unitsDelivered" },
				gmvDelivered: { $sum: "$gmvDelivered" },
			},
		},
	]);
	const productsByShop = new Map<
		string,
		NonNullable<DailyMetricValues["topProducts"]>
	>();
	for (const row of await rows.toArray()) {
		const shopId = row._id?.shop == null ? null : String(row._id.shop);
		const productId = row._id?.product == null ? null : String(row._id.product);
		if (!shopId || !productId) continue;
		const products = productsByShop.get(shopId) ?? [];
		products.push({
			product: productId,
			listing: row.listing == null ? null : String(row.listing),
			views: 0,
			ordersPlaced: Number(row.ordersPlaced ?? 0),
			unitsDelivered: Number(row.unitsDelivered ?? 0),
			gmvDelivered: Number(row.gmvDelivered ?? 0),
		});
		productsByShop.set(shopId, products);
	}
	return productsByShop;
}

type CountByShopRow = { _id?: unknown; count?: unknown };
type ResaleFacets = {
	received?: CountByShopRow[];
	acceptedInTime?: CountByShopRow[];
	cancelledBySupplier?: CountByShopRow[];
	delivered?: CountByShopRow[];
};

export async function aggregateResaleMetrics(
	payload: Payload,
	date: string,
	shopIds: readonly string[],
): Promise<Map<string, Pick<DailyMetricValues, "resale">>> {
	const adapter = payload.db as unknown as MongooseAdapter;
	const purchaseOrders = adapter.collections["purchase-orders"]?.collection;
	const commissions = adapter.collections["reseller-commissions"]?.collection;
	if (!purchaseOrders || !commissions)
		throw new Error("Mongo resale collections are unavailable.");
	const { start, end } = doualaDayWindow(date);
	const [facetRows, commissionRows] = await Promise.all([
		purchaseOrders
			.aggregate<ResaleFacets>([
				{
					$match: {
						$or: [
							{ sentAt: { $gte: start, $lt: end } },
							{ acceptedAt: { $gte: start, $lt: end } },
							{ "cancellation.at": { $gte: start, $lt: end } },
							{
								statusHistory: {
									$elemMatch: {
										status: "delivered",
										at: { $gte: start, $lt: end },
									},
								},
							},
						],
					},
				},
				{
					$facet: {
						received: [
							{ $match: { sentAt: { $gte: start, $lt: end } } },
							{ $group: { _id: "$supplierShop", count: { $sum: 1 } } },
						],
						acceptedInTime: [
							{
								$match: {
									acceptedAt: { $gte: start, $lt: end },
									$expr: { $lte: ["$acceptedAt", "$acceptBy"] },
								},
							},
							{ $group: { _id: "$supplierShop", count: { $sum: 1 } } },
						],
						cancelledBySupplier: [
							{
								$match: {
									"cancellation.at": { $gte: start, $lt: end },
									"cancellation.by": "supplier",
								},
							},
							{ $group: { _id: "$supplierShop", count: { $sum: 1 } } },
						],
						delivered: [
							{ $unwind: "$statusHistory" },
							{
								$match: {
									"statusHistory.status": "delivered",
									"statusHistory.at": { $gte: start, $lt: end },
								},
							},
							{ $group: { _id: "$resellerShop", count: { $sum: 1 } } },
						],
					},
				},
			])
			.toArray(),
		commissions
			.aggregate<{ _id?: unknown; total?: unknown }>([
				{
					$match: {
						createdAt: { $gte: start, $lt: end },
						resellerShop: { $in: shopIds.map(storedId) },
						status: { $in: ["accrued", "payable", "held", "paid"] },
					},
				},
				{ $group: { _id: "$resellerShop", total: { $sum: "$amount" } } },
			])
			.toArray(),
	]);
	const result = new Map<string, Pick<DailyMetricValues, "resale">>();
	for (const shopId of shopIds) {
		result.set(shopId, {
			resale: {
				purchaseOrdersReceived: 0,
				purchaseOrdersAcceptedInTime: 0,
				purchaseOrdersCancelledBySupplier: 0,
				resaleDelivered: 0,
				commissionAccrued: 0,
			},
		});
	}
	const facets = facetRows[0];
	const addCount = (
		rows: CountByShopRow[] | undefined,
		metric:
			| "purchaseOrdersReceived"
			| "purchaseOrdersAcceptedInTime"
			| "purchaseOrdersCancelledBySupplier"
			| "resaleDelivered",
	) => {
		for (const row of rows ?? []) {
			if (row._id == null) continue;
			const resale = result.get(String(row._id))?.resale;
			if (resale) resale[metric] = Number(row.count ?? 0);
		}
	};
	addCount(facets?.received, "purchaseOrdersReceived");
	addCount(facets?.acceptedInTime, "purchaseOrdersAcceptedInTime");
	addCount(facets?.cancelledBySupplier, "purchaseOrdersCancelledBySupplier");
	addCount(facets?.delivered, "resaleDelivered");
	for (const row of commissionRows) {
		if (row._id == null) continue;
		const resale = result.get(String(row._id))?.resale;
		if (resale) resale.commissionAccrued = Number(row.total ?? 0);
	}
	return result;
}

export async function aggregateInventorySnapshot(
	payload: Payload,
	shopIds: readonly string[],
): Promise<
	Map<
		string,
		Pick<
			DailyMetricValues,
			"inventoryCostValue" | "outOfStockVariants" | "lowStockVariants"
		>
	>
> {
	const adapter = payload.db as unknown as MongooseAdapter;
	const collection = adapter.collections["product-variants"]?.collection;
	if (!collection)
		throw new Error("Mongo collection 'product-variants' is unavailable.");
	const rows = await collection
		.aggregate<{
			_id?: unknown;
			inventoryCostValue?: unknown;
			outOfStockVariants?: unknown;
			lowStockVariants?: unknown;
		}>([
			{
				$match: {
					shop: { $in: shopIds.map(storedId) },
					trackInventory: true,
					$or: [{ archivedAt: { $exists: false } }, { archivedAt: null }],
				},
			},
			{
				$group: {
					_id: "$shop",
					inventoryCostValue: {
						$sum: {
							$multiply: [
								{ $ifNull: ["$stockOnHand", 0] },
								{ $ifNull: ["$cost", 0] },
							],
						},
					},
					outOfStockVariants: {
						$sum: {
							$cond: [
								{
									$lte: [
										{
											$subtract: [
												{ $ifNull: ["$stockOnHand", 0] },
												{ $ifNull: ["$stockReserved", 0] },
											],
										},
										0,
									],
								},
								1,
								0,
							],
						},
					},
					lowStockVariants: {
						$sum: {
							$cond: [
								{
									$and: [
										{
											$gt: [
												{
													$subtract: [
														{ $ifNull: ["$stockOnHand", 0] },
														{ $ifNull: ["$stockReserved", 0] },
													],
												},
												0,
											],
										},
										{ $gt: ["$lowStockThreshold", 0] },
										{
											$lte: [
												{
													$subtract: [
														{ $ifNull: ["$stockOnHand", 0] },
														{ $ifNull: ["$stockReserved", 0] },
													],
												},
												"$lowStockThreshold",
											],
										},
									],
								},
								1,
								0,
							],
						},
					},
				},
			},
		])
		.toArray();
	return new Map(
		rows.flatMap((row) =>
			row._id == null
				? []
				: [
						[
							String(row._id),
							{
								inventoryCostValue: Number(row.inventoryCostValue ?? 0),
								outOfStockVariants: Number(row.outOfStockVariants ?? 0),
								lowStockVariants: Number(row.lowStockVariants ?? 0),
							},
						] as const,
					],
		),
	);
}

export async function aggregateDeliveredCogs(
	payload: Payload,
	date: string,
	shopIds: readonly string[],
): Promise<Map<string, number>> {
	const adapter = payload.db as unknown as MongooseAdapter;
	const collection = adapter.collections["stock-movements"]?.collection;
	if (!collection)
		throw new Error("Mongo collection 'stock-movements' is unavailable.");
	const { start, end } = doualaDayWindow(date);
	const rows = await collection
		.aggregate<{ _id?: unknown; cogsDelivered?: unknown }>([
			{
				$match: {
					type: "sale",
					order: { $ne: null },
					shop: { $in: shopIds.map(storedId) },
				},
			},
			{
				$lookup: {
					from: "order-events",
					let: { movementOrder: "$order" },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $eq: ["$order", "$$movementOrder"] },
										{ $eq: ["$type", "order.delivered"] },
										{ $gte: ["$createdAt", start] },
										{ $lt: ["$createdAt", end] },
									],
								},
							},
						},
					],
					as: "deliveryEvent",
				},
			},
			{ $unwind: "$deliveryEvent" },
			{
				$lookup: {
					from: "product-variants",
					localField: "variant",
					foreignField: "_id",
					as: "variantDoc",
				},
			},
			{ $unwind: "$variantDoc" },
			{
				$group: {
					_id: "$shop",
					cogsDelivered: {
						$sum: {
							$multiply: [
								{ $abs: { $ifNull: ["$quantity", 0] } },
								{ $ifNull: ["$variantDoc.cost", 0] },
							],
						},
					},
				},
			},
		])
		.toArray();
	return new Map(
		rows.flatMap((row) =>
			row._id == null
				? []
				: [[String(row._id), Number(row.cogsDelivered ?? 0)] as const],
		),
	);
}

type ConversationMessageRow = {
	shop?: unknown;
	conversationId?: unknown;
	senderSide?: unknown;
	createdAt?: unknown;
};

export async function aggregateConversationMetrics(
	payload: Payload,
	date: string,
	shopIds: readonly string[],
	now: Date,
): Promise<
	Map<string, Pick<DailyMetricValues, "responseBuckets" | "awaitingReply">>
> {
	const adapter = payload.db as unknown as MongooseAdapter;
	const collection = adapter.collections.conversations?.collection;
	if (!collection)
		throw new Error("Mongo collection 'conversations' is unavailable.");
	const { start, end } = doualaDayWindow(date);
	const messagesUntil = new Date(
		Math.min(now.getTime(), end.getTime() + 24 * 60 * 60_000),
	);
	const messageRows = await collection
		.aggregate<ConversationMessageRow>([
			{ $match: { shop: { $in: shopIds.map(storedId) } } },
			{
				$lookup: {
					from: "messages",
					localField: "_id",
					foreignField: "conversation",
					as: "messageDoc",
				},
			},
			{ $unwind: "$messageDoc" },
			{
				$match: {
					"messageDoc.senderSide": { $in: ["buyer", "shop"] },
					"messageDoc.createdAt": {
						$gte: new Date(start.getTime() - 12 * 60 * 60_000),
						$lt: messagesUntil,
					},
				},
			},
			{
				$project: {
					_id: 0,
					shop: "$shop",
					conversationId: { $toString: "$_id" },
					senderSide: "$messageDoc.senderSide",
					createdAt: "$messageDoc.createdAt",
				},
			},
		])
		.toArray();
	const messagesByShop = new Map<string, ResponseBurstMessage[]>();
	for (const row of messageRows) {
		if (
			row.shop == null ||
			typeof row.conversationId !== "string" ||
			(row.senderSide !== "buyer" && row.senderSide !== "shop") ||
			(row.createdAt !== undefined &&
				typeof row.createdAt !== "string" &&
				!(row.createdAt instanceof Date))
		) {
			continue;
		}
		const shopId = String(row.shop);
		const messages = messagesByShop.get(shopId) ?? [];
		messages.push({
			conversationId: row.conversationId,
			senderSide: row.senderSide,
			createdAt:
				row.createdAt instanceof Date
					? row.createdAt.toISOString()
					: String(row.createdAt),
		});
		messagesByShop.set(shopId, messages);
	}
	const awaitingRows = await collection
		.aggregate<{ _id?: unknown; count?: unknown }>([
			{
				$match: {
					shop: { $in: shopIds.map(storedId) },
					awaitingReply: true,
					lastMessageAt: { $lt: new Date(now.getTime() - 12 * 60 * 60_000) },
				},
			},
			{ $group: { _id: "$shop", count: { $sum: 1 } } },
		])
		.toArray();
	const result = new Map<
		string,
		Pick<DailyMetricValues, "responseBuckets" | "awaitingReply">
	>();
	for (const shopId of shopIds) {
		result.set(shopId, {
			responseBuckets: aggregateResponseBuckets(
				messagesByShop.get(shopId) ?? [],
				date,
				now,
			),
			awaitingReply: 0,
		});
	}
	for (const row of awaitingRows) {
		if (row._id == null) continue;
		const existing = result.get(String(row._id));
		if (existing) existing.awaitingReply = Number(row.count ?? 0);
	}
	return result;
}

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, canonical(entry)]),
	);
}

function metricsHash(metrics: DailyMetricValues): string {
	return createHash("sha256")
		.update(JSON.stringify(canonical(metrics)))
		.digest("hex");
}

export async function upsertShopDailyStat(
	payload: Payload,
	input: {
		shopId: string;
		date: string;
		metrics: DailyMetricValues;
		computedAt: string;
		version?: number;
	},
): Promise<"created" | "updated" | "unchanged"> {
	const hash = metricsHash(input.metrics);
	const existing = await payload.find({
		collection: "shop-daily-stats",
		where: {
			and: [
				{ shop: { equals: input.shopId } },
				{ date: { equals: input.date } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const current = existing.docs[0];
	if (current?.metricsHash === hash) return "unchanged";
	const data = {
		...input.metrics,
		shop: input.shopId,
		date: input.date,
		computedAt: input.computedAt,
		version: input.version ?? 1,
		metricsHash: hash,
	};
	if (current) {
		await payload.update({
			collection: "shop-daily-stats",
			id: current.id,
			data,
			depth: 0,
			overrideAccess: true,
		});
		return "updated";
	}
	await payload.create({
		collection: "shop-daily-stats",
		data,
		depth: 0,
		overrideAccess: true,
	});
	return "created";
}

function emptyDailyMetrics(): DailyMetricValues {
	return {
		views: 0,
		phoneReveals: 0,
		favouritesAdded: 0,
		conversationsStarted: 0,
		ordersPlaced: 0,
		ordersConfirmed: 0,
		ordersAccepted: 0,
		ordersDelivered: 0,
		ordersCancelledBySeller: 0,
		ordersCancelledByBuyer: 0,
		codShipped: 0,
		codRefused: 0,
		gmvDelivered: 0,
		unitsDelivered: 0,
		cogsDelivered: 0,
		inventoryCostValue: 0,
		outOfStockVariants: 0,
		lowStockVariants: 0,
		awaitingReply: 0,
		responseBuckets: {
			m5: 0,
			m15: 0,
			h1: 0,
			h4: 0,
			h24: 0,
			over24h: 0,
			unanswered: 0,
		},
		topProducts: [],
		resale: {
			purchaseOrdersReceived: 0,
			purchaseOrdersAcceptedInTime: 0,
			purchaseOrdersCancelledBySupplier: 0,
			resaleDelivered: 0,
			commissionAccrued: 0,
		},
	};
}

function mergeMetrics(
	target: DailyMetricValues,
	source: Partial<DailyMetricValues> | undefined,
): DailyMetricValues {
	if (!source) return target;
	for (const key of [
		"views",
		"phoneReveals",
		"favouritesAdded",
		"conversationsStarted",
		"ordersPlaced",
		"ordersConfirmed",
		"ordersAccepted",
		"ordersDelivered",
		"ordersCancelledBySeller",
		"ordersCancelledByBuyer",
		"codShipped",
		"codRefused",
		"gmvDelivered",
		"unitsDelivered",
		"cogsDelivered",
		"inventoryCostValue",
		"outOfStockVariants",
		"lowStockVariants",
		"awaitingReply",
	] as const) {
		const metric = key satisfies keyof DailyMetricValues;
		target[metric] = Number(target[metric] ?? 0) + Number(source[metric] ?? 0);
	}
	for (const bucket of [
		"m5",
		"m15",
		"h1",
		"h4",
		"h24",
		"over24h",
		"unanswered",
	] as const) {
		if (!target.responseBuckets || !source.responseBuckets) continue;
		target.responseBuckets[bucket] =
			Number(target.responseBuckets[bucket] ?? 0) +
			Number(source.responseBuckets[bucket] ?? 0);
	}
	if (target.resale && source.resale) {
		for (const key of [
			"purchaseOrdersReceived",
			"purchaseOrdersAcceptedInTime",
			"purchaseOrdersCancelledBySupplier",
			"resaleDelivered",
			"commissionAccrued",
		] as const) {
			target.resale[key] =
				Number(target.resale[key] ?? 0) + Number(source.resale[key] ?? 0);
		}
	}
	const products = new Map(
		(target.topProducts ?? []).map((product) => [
			String(product.product),
			product,
		]),
	);
	for (const product of source.topProducts ?? []) {
		const key = String(product.product);
		const current = products.get(key);
		if (!current) {
			products.set(key, product);
			continue;
		}
		current.views = Number(current.views ?? 0) + Number(product.views ?? 0);
		current.ordersPlaced =
			Number(current.ordersPlaced ?? 0) + Number(product.ordersPlaced ?? 0);
		current.unitsDelivered =
			Number(current.unitsDelivered ?? 0) + Number(product.unitsDelivered ?? 0);
		current.gmvDelivered =
			Number(current.gmvDelivered ?? 0) + Number(product.gmvDelivered ?? 0);
	}
	target.topProducts = [...products.values()]
		.sort(
			(left, right) =>
				Number(right.gmvDelivered ?? 0) - Number(left.gmvDelivered ?? 0) ||
				Number(right.views ?? 0) - Number(left.views ?? 0),
		)
		.slice(0, 10);
	return target;
}

export async function aggregateShopDailyStatsForDay(
	payload: Payload,
	date: string,
	options: { computedAt?: string; version?: number; now?: Date } = {},
): Promise<{
	shopsProcessed: number;
	created: number;
	updated: number;
	unchanged: number;
}> {
	const { start, end } = doualaDayWindow(date);
	const now = options.now ?? new Date();
	const shouldSnapshotInventory = date === previousDoualaDate(now);
	let page = 1;
	let shopsProcessed = 0;
	let created = 0;
	let updated = 0;
	let unchanged = 0;
	let totalPages = 1;
	while (page <= totalPages) {
		const shops = await payload.find({
			collection: "shops",
			where: {
				or: [
					{ status: { in: ["active", "suspended"] } },
					{
						and: [
							{ status: { equals: "closed" } },
							{ closedAt: { greater_than_equal: start.toISOString() } },
							{ closedAt: { less_than: end.toISOString() } },
						],
					},
				],
			},
			limit: 200,
			page,
			depth: 0,
			sort: "id",
			overrideAccess: true,
		});
		totalPages = shops.totalPages;
		page++;
		const shopIds = shops.docs.map((shop) => String(shop.id));
		if (shopIds.length === 0) continue;
		const savedSnapshots = shouldSnapshotInventory
			? new Map<string, ShopDailyStat>()
			: new Map(
					(
						await payload.find({
							collection: "shop-daily-stats",
							where: {
								and: [{ shop: { in: shopIds } }, { date: { equals: date } }],
							},
							limit: shopIds.length,
							depth: 0,
							overrideAccess: true,
						})
					).docs.flatMap((row) => {
						const id = relationId(row.shop);
						return id ? [[id, row] as const] : [];
					}),
				);
		const [
			interactionMetrics,
			orderMetrics,
			productOrderMetrics,
			inventoryMetrics,
			conversationMetrics,
			cogsMetrics,
			resaleMetrics,
		] = await Promise.all([
			aggregateInteractionMetrics(payload, date, shopIds),
			aggregateOrderMetrics(payload, date, shopIds),
			aggregateTopProductOrderMetrics(payload, date, shopIds),
			shouldSnapshotInventory
				? aggregateInventorySnapshot(payload, shopIds)
				: Promise.resolve(new Map()),
			aggregateConversationMetrics(payload, date, shopIds, now),
			aggregateDeliveredCogs(payload, date, shopIds),
			aggregateResaleMetrics(payload, date, shopIds),
		]);
		for (const shopId of shopIds) {
			const metrics = mergeMetrics(
				mergeMetrics(
					mergeMetrics(
						mergeMetrics(
							mergeMetrics(emptyDailyMetrics(), interactionMetrics.get(shopId)),
							orderMetrics.get(shopId),
						),
						{ topProducts: productOrderMetrics.get(shopId) },
					),
					inventoryMetrics.get(shopId),
				),
				conversationMetrics.get(shopId),
			);
			metrics.cogsDelivered = cogsMetrics.get(shopId) ?? 0;
			if (!shouldSnapshotInventory) {
				const snapshot = savedSnapshots.get(shopId);
				metrics.inventoryCostValue = Number(snapshot?.inventoryCostValue ?? 0);
				metrics.outOfStockVariants = Number(snapshot?.outOfStockVariants ?? 0);
				metrics.lowStockVariants = Number(snapshot?.lowStockVariants ?? 0);
			}
			mergeMetrics(metrics, resaleMetrics.get(shopId));
			const result = await upsertShopDailyStat(payload, {
				shopId,
				date,
				metrics,
				computedAt: options.computedAt ?? now.toISOString(),
				version: options.version ?? 1,
			});
			shopsProcessed++;
			if (result === "created") created++;
			else if (result === "updated") updated++;
			else unchanged++;
		}
	}
	return { shopsProcessed, created, updated, unchanged };
}
