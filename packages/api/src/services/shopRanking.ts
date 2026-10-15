import type { Payload } from "payload";
import { SHOP_SERVICE_CONTEXT } from "../collections/Shops";
import {
	RANKING_WINDOW_DAYS,
	type ShopRankingSignals,
	shopRankingScore,
} from "../contracts/shopRanking";
import { relationId } from "../lib/relationId";
import {
	type Doc,
	isoOrNull,
	num,
	rankingInputOf,
	rankingSignalsOf,
} from "../lib/shopRanking";

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

const sameSignals = (a: ShopRankingSignals, b: ShopRankingSignals) =>
	a.ordersPlaced === b.ordersPlaced &&
	a.ordersAccepted === b.ordersAccepted &&
	a.ordersDelivered === b.ordersDelivered &&
	a.catalogueUpdatedAt === b.catalogueUpdatedAt;

const PAGE_SIZE = 100;

/**
 * Refreshes every active shop's order and freshness signals; the Shops hook
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
		const orders = await orderSignals(
			payload,
			docs.map((doc) => String(doc.id)),
			now,
		);
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
			if (
				sameSignals(signals, rankingSignalsOf(doc)) &&
				num(doc.rankingScore) === score
			)
				continue;
			try {
				await payload.update({
					collection: "shops",
					id,
					overrideAccess: true,
					context: SHOP_SERVICE_CONTEXT,
					data: { rankingSignals: signals },
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
