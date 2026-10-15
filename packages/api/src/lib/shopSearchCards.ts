import type { Payload } from "payload";
import { type ShopPreview, type ShopSearchHit, toMediaRef } from "./publicShop";
import { shopCapabilities } from "./shopCapabilities";

export const MAX_SHOP_PREVIEWS = 3;

/**
 * The live check behind a page of indexed shop hits: a lost `shop.*` publish
 * can leave a suspended shop, or a lapsed level, in the index. One query per
 * page drops what is no longer active or below `minShopLevel`, and takes the
 * level, badge and banner from the live record rather than the index.
 */
export async function liveShopHits(
	payload: Payload,
	hits: ShopSearchHit[],
	minShopLevel: number | null,
): Promise<ShopSearchHit[]> {
	const ids = hits.map((hit) => hit.id).filter(Boolean);
	if (ids.length === 0) return hits;
	const result = await payload.find({
		collection: "shops",
		where: { and: [{ id: { in: ids } }, { status: { equals: "active" } }] },
		depth: 1,
		limit: 0,
		pagination: false,
	});
	const live = new Map(result.docs.map((doc) => [String(doc.id), doc]));
	const kept: ShopSearchHit[] = [];
	for (const hit of hits) {
		const doc = live.get(hit.id);
		if (!doc) continue;
		const level = typeof doc.level === "number" ? doc.level : hit.level;
		const capabilities = shopCapabilities({
			status: doc.status ?? "active",
			level,
			levelExpiresAt: doc.levelExpiresAt,
		});
		if (minShopLevel && capabilities.effectiveLevel < minShopLevel) continue;
		const banner = toMediaRef(doc.banner);
		kept.push({
			...hit,
			level,
			badge: capabilities.badge,
			bannerUrl: banner?.url ?? hit.bannerUrl,
		});
	}
	return kept;
}

/**
 * Each shop's newest published listings, for the cards that show a few
 * product thumbnails. One small query per shop, so callers keep `limit` low
 * when they ask for these; a failed read leaves that shop without previews
 * rather than failing the search.
 */
export async function withShopPreviews(
	payload: Payload,
	hits: ShopSearchHit[],
	count: number,
): Promise<ShopSearchHit[]> {
	return Promise.all(
		hits.map(async (hit) => {
			try {
				const result = await payload.find({
					collection: "listings",
					where: {
						and: [
							{ shop: { equals: hit.id } },
							{ status: { equals: "published" } },
						],
					},
					sort: "-createdAt",
					depth: 1,
					limit: count,
				});
				const previews: ShopPreview[] = result.docs.map((doc) => {
					const image = toMediaRef(doc.images?.[0]?.image);
					return {
						id: String(doc.id),
						title: doc.title,
						imageUrl: image?.thumbnailURL ?? image?.url ?? null,
					};
				});
				return { ...hit, previews };
			} catch (error) {
				console.error(`[search:shops] previews failed for ${hit.id}`, error);
				return { ...hit, previews: [] };
			}
		}),
	);
}
