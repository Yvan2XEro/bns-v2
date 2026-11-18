import type { Payload } from "payload";
import { SHOP_SERVICE_CONTEXT } from "../collections/Shops";
import {
	RANKING_WINDOW_DAYS,
	type ShopRankingSignals,
	shopRankingScore,
} from "../contracts/shopRanking";
import {
	RESPONSE_TIME_WINDOW_DAYS,
	type ShopResponseTime,
	shopResponseTimeOf,
} from "../contracts/shopTrust";
import { relationId } from "../lib/relationId";
import {
	type Doc,
	isoOrNull,
	num,
	rankingInputOf,
	rankingSignalsOf,
} from "../lib/shopRanking";
import {
	type ResponseBurstMessage,
	responseDelaysSince,
} from "./shopResponseBursts";

function windowStart(now: Date): string {
	return new Date(now.getTime() - RANKING_WINDOW_DAYS * 86_400_000)
		.toISOString()
		.slice(0, 10);
}

/** The order signals of a page of shops, from `shop-daily-stats`. */
async function orderSignals(
	payload: Payload,
	shopIds: string[],
	now: Date,
): Promise<Map<string, Omit<ShopRankingSignals, "catalogueUpdatedAt">>> {
	const result = await payload.find({
		collection: "shop-daily-stats",
		where: {
			and: [
				{ shop: { in: shopIds } },
				{ date: { greater_than_equal: windowStart(now) } },
			],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		select: {
			shop: true,
			ordersPlaced: true,
			ordersAccepted: true,
			ordersDelivered: true,
		},
	});
	const totals = new Map<
		string,
		Omit<ShopRankingSignals, "catalogueUpdatedAt">
	>();
	for (const row of result.docs as Doc[]) {
		const id = relationId(row.shop);
		if (!id) continue;
		const total = totals.get(id) ?? {
			ordersPlaced: 0,
			ordersAccepted: 0,
			ordersDelivered: 0,
		};
		total.ordersPlaced += num(row.ordersPlaced);
		total.ordersAccepted += num(row.ordersAccepted);
		total.ordersDelivered += num(row.ordersDelivered);
		totals.set(id, total);
	}
	return totals;
}

async function catalogueUpdatedAt(
	payload: Payload,
	shopId: string,
): Promise<string | null> {
	const result = await payload.find({
		collection: "listings",
		where: {
			and: [{ shop: { equals: shopId } }, { status: { equals: "published" } }],
		},
		sort: "-updatedAt",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		select: { updatedAt: true },
	});
	return isoOrNull((result.docs[0] as Doc | undefined)?.updatedAt);
}

const SILENCE_MS = 12 * 60 * 60_000;

type ResponseStats = { responseTime: ShopResponseTime | null; sample: number };

/**
 * The public response time of a page of shops: every buyer burst of the last
 * 30 days and the shop's first reply, by the same burst rule as the insights.
 * Computed here, nightly, so the public shop page only reads the stored bucket.
 */
async function responseStats(
	payload: Payload,
	shopIds: string[],
	now: Date,
): Promise<Map<string, ResponseStats>> {
	const windowStart = new Date(
		now.getTime() - RESPONSE_TIME_WINDOW_DAYS * 86_400_000,
	);
	// The silence before a window's first burst decides whether it is one.
	const since = new Date(windowStart.getTime() - SILENCE_MS).toISOString();
	const conversations = await payload.find({
		collection: "conversations",
		where: {
			and: [
				{ shop: { in: shopIds } },
				{ lastMessageAt: { greater_than_equal: since } },
			],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		select: { shop: true },
	});
	const shopOf = new Map<string, string>();
	for (const doc of conversations.docs as Doc[]) {
		const shopId = relationId(doc.shop);
		if (shopId) shopOf.set(String(doc.id), shopId);
	}
	const byShop = new Map<string, ResponseBurstMessage[]>();
	if (shopOf.size > 0) {
		const messages = await payload.find({
			collection: "messages",
			where: {
				and: [
					{ conversation: { in: [...shopOf.keys()] } },
					{ senderSide: { in: ["buyer", "shop"] } },
					{ createdAt: { greater_than_equal: since } },
				],
			},
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
			select: { conversation: true, senderSide: true, createdAt: true },
		});
		for (const doc of messages.docs as Doc[]) {
			const conversationId = relationId(doc.conversation);
			const shopId = conversationId ? shopOf.get(conversationId) : undefined;
			const side = doc.senderSide;
			if (!conversationId || !shopId || (side !== "buyer" && side !== "shop"))
				continue;
			const rows = byShop.get(shopId) ?? [];
			rows.push({
				conversationId,
				senderSide: side,
				createdAt: String(isoOrNull(doc.createdAt) ?? ""),
			});
			byShop.set(shopId, rows);
		}
	}
	const result = new Map<string, ResponseStats>();
	for (const shopId of shopIds) {
		const delays = responseDelaysSince(
			byShop.get(shopId) ?? [],
			windowStart,
			now,
		);
		result.set(shopId, {
			responseTime: shopResponseTimeOf(delays),
			sample: delays.length,
		});
	}
	return result;
}

function sameResponse(doc: Doc, next: ResponseStats): boolean {
	const stored = (doc.trustStats ?? {}) as Doc;
	return (
		(stored.responseTime ?? null) === next.responseTime &&
		num(stored.responseSample) === next.sample
	);
}

const sameSignals = (a: ShopRankingSignals, b: ShopRankingSignals) =>
	a.ordersPlaced === b.ordersPlaced &&
	a.ordersAccepted === b.ordersAccepted &&
	a.ordersDelivered === b.ordersDelivered &&
	a.catalogueUpdatedAt === b.catalogueUpdatedAt;

const PAGE_SIZE = 100;

/**
 * Refreshes every active shop's order and freshness signals, and its public
 * response time (`trustStats`); the Shops hook
 * turns them into the score. A shop whose signals and score are unchanged is
 * not written, so the nightly run does not reindex the whole shops index.
 */
export async function recomputeShopRankings(
	payload: Payload,
	now: Date = new Date(),
): Promise<{ checked: number; updated: number }> {
	let checked = 0;
	let updated = 0;
	for (let page = 1; ; page++) {
		const result = await payload.find({
			collection: "shops",
			where: { status: { equals: "active" } },
			depth: 0,
			limit: PAGE_SIZE,
			page,
			sort: "createdAt",
			overrideAccess: true,
		});
		const docs = result.docs as unknown as Doc[];
		const ids = docs.map((doc) => String(doc.id));
		const [orders, responses] = await Promise.all([
			orderSignals(payload, ids, now),
			responseStats(payload, ids, now),
		]);
		for (const doc of docs) {
			const id = String(doc.id);
			checked++;
			const signals: ShopRankingSignals = {
				ordersPlaced: 0,
				ordersAccepted: 0,
				ordersDelivered: 0,
				...orders.get(id),
				catalogueUpdatedAt: await catalogueUpdatedAt(payload, id),
			};
			const score = shopRankingScore(
				rankingInputOf({ ...doc, rankingSignals: signals }, now),
				now,
			);
			const response = responses.get(id) ?? {
				responseTime: null,
				sample: 0,
			};
			const responseUnchanged = sameResponse(doc, response);
			if (
				sameSignals(signals, rankingSignalsOf(doc)) &&
				num(doc.rankingScore) === score &&
				responseUnchanged
			)
				continue;
			try {
				await payload.update({
					collection: "shops",
					id,
					overrideAccess: true,
					context: SHOP_SERVICE_CONTEXT,
					data: {
						rankingSignals: signals,
						...(responseUnchanged
							? {}
							: {
									trustStats: {
										responseTime: response.responseTime,
										responseSample: response.sample,
										computedAt: now.toISOString(),
									},
								}),
					},
				});
				updated++;
			} catch (error) {
				console.error(`[shops] ranking update failed for shop ${id}:`, error);
			}
		}
		if (!result.hasNextPage) break;
	}
	return { checked, updated };
}
