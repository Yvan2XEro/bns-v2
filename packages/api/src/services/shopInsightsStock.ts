import type { Payload } from "payload";
import { relationId } from "../lib/relationId";
import { availableOf, isOutOfStock } from "../lib/variants";
import type { ShopDailyStat } from "../payload-types";

const DAY_MS = 86_400_000;

function isoDay(date: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Africa/Douala",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

function dayOffset(day: string, offset: number): string {
	const date = new Date(`${day}T00:00:00.000Z`);
	date.setTime(date.getTime() + offset * DAY_MS);
	return date.toISOString().slice(0, 10);
}

export async function getShopStockInsights(
	payload: Payload,
	shopId: string,
	now: Date,
) {
	const today = isoDay(now);
	const [variants, stats] = await Promise.all([
		payload.find({
			collection: "product-variants",
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ trackInventory: { equals: true } },
					{
						or: [
							{ archivedAt: { exists: false } },
							{ archivedAt: { equals: null } },
						],
					},
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		}),
		payload.find({
			collection: "shop-daily-stats",
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ date: { greater_than_equal: dayOffset(today, -29) } },
					{ date: { less_than_equal: today } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		}),
	]);

	const productIds = [
		...new Set(variants.docs.map((variant) => relationId(variant.product))),
	].filter((id): id is string => id !== null);
	const products = productIds.length
		? await payload.find({
				collection: "products",
				where: {
					and: [{ id: { in: productIds } }, { status: { equals: "active" } }],
				},
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
			})
		: { docs: [] };
	const productById = new Map(
		products.docs.map((product) => [String(product.id), product]),
	);
	const soldByProduct = new Map<string, number>();
	const viewedByProduct = new Map<string, number>();
	for (const row of stats.docs as ShopDailyStat[]) {
		for (const topProduct of row.topProducts ?? []) {
			const productId = relationId(topProduct.product);
			if (!productId) continue;
			const delivered = Number(topProduct.unitsDelivered ?? 0);
			soldByProduct.set(
				productId,
				(soldByProduct.get(productId) ?? 0) + delivered,
			);
			if (row.date >= dayOffset(today, -6)) {
				viewedByProduct.set(
					productId,
					(viewedByProduct.get(productId) ?? 0) + Number(topProduct.views ?? 0),
				);
			}
		}
	}

	const restock = variants.docs
		.flatMap((variant) => {
			const productId = relationId(variant.product);
			const product = productId ? productById.get(productId) : undefined;
			const available = availableOf(variant);
			const averageDailyUnits = (soldByProduct.get(productId ?? "") ?? 0) / 30;
			if (
				!product ||
				averageDailyUnits <= 0 ||
				available / averageDailyUnits >= 7
			) {
				return [];
			}
			return [
				{
					variantId: String(variant.id),
					productId: String(product.id),
					productTitle: product.title,
					daysOfCover: Number((available / averageDailyUnits).toFixed(1)),
					available,
					averageDailyUnits: Number(averageDailyUnits.toFixed(2)),
				},
			];
		})
		.sort((left, right) => left.daysOfCover - right.daysOfCover);
	const outOfStockWithViews = variants.docs.flatMap((variant) => {
		if (!isOutOfStock(variant)) return [];
		const productId = relationId(variant.product);
		const product = productId ? productById.get(productId) : undefined;
		const views = productId ? (viewedByProduct.get(productId) ?? 0) : 0;
		return product && views > 0
			? [
					{
						variantId: String(variant.id),
						productId: String(product.id),
						productTitle: product.title,
						views,
					},
				]
			: [];
	});
	return { restock, outOfStockWithViews };
}
