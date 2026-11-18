import {
	type ShopFeatured,
	type ShopRankingInput,
	type ShopRankingSignals,
	type SponsorCandidate,
	shopRankingScore,
} from "../contracts/shopRanking";
import { relationId } from "./relationId";
import { shopCapabilities } from "./shopCapabilities";

export type Doc = Record<string, unknown>;

export const num = (value: unknown): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

export const isoOrNull = (value: unknown): string | null => {
	if (value instanceof Date) return value.toISOString();
	return typeof value === "string" && value ? value : null;
};

export function rankingSignalsOf(doc: Doc | undefined): ShopRankingSignals {
	const signals = (doc?.rankingSignals ?? {}) as Doc;
	return {
		ordersPlaced: num(signals.ordersPlaced),
		ordersAccepted: num(signals.ordersAccepted),
		ordersDelivered: num(signals.ordersDelivered),
		catalogueUpdatedAt: isoOrNull(signals.catalogueUpdatedAt),
	};
}

function capabilitiesOf(doc: Doc, now: Date) {
	return shopCapabilities(
		{
			status: typeof doc.status === "string" ? doc.status : "active",
			level: typeof doc.level === "number" ? doc.level : null,
			levelExpiresAt: isoOrNull(doc.levelExpiresAt),
		},
		now,
	);
}

export function rankingInputOf(doc: Doc, now: Date): ShopRankingInput {
	return {
		...rankingSignalsOf(doc),
		active: (doc.status ?? "active") === "active",
		effectiveLevel: capabilitiesOf(doc, now).effectiveLevel,
		rating: num(doc.rating),
		totalReviews: num(doc.totalReviews),
		publishedListingCount: num(doc.publishedListingCount),
	};
}

export function featuredOf(doc: Doc): ShopFeatured | null {
	const featured = doc.featured as Doc | null | undefined;
	if (!featured || typeof featured !== "object") return null;
	const until = isoOrNull(featured.until);
	if (!until) return null;
	return {
		until,
		cities: Array.isArray(featured.cities)
			? featured.cities.filter(
					(city): city is string => typeof city === "string" && !!city.trim(),
				)
			: [],
		categoryIds: Array.isArray(featured.categories)
			? featured.categories
					.map((category) => relationId(category))
					.filter((id): id is string => !!id)
			: [],
	};
}

export function sponsorCandidateOf(doc: Doc, now: Date): SponsorCandidate {
	return {
		active: doc.status === "active",
		effectiveLevel: capabilitiesOf(doc, now).effectiveLevel,
		rating: num(doc.rating),
		totalReviews: num(doc.totalReviews),
		featured: featuredOf(doc),
	};
}

/**
 * Shops' `beforeChange`: every write re-derives the score from the merged
 * document, so a new review, a published listing, a level change or a
 * suspension moves the ranking at once. The order and freshness signals come
 * from the nightly job below.
 */
export function applyShopRankingScore({
	data,
	originalDoc,
}: {
	data: Doc;
	originalDoc?: Doc;
}): Doc {
	const merged: Doc = { ...(originalDoc ?? {}), ...data };
	data.rankingScore = shopRankingScore(rankingInputOf(merged, new Date()));
	return data;
}
