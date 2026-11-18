/**
 * The organic shop ranking and the rules for sponsored shop slots. The same
 * score orders the shop directory, the "shops that sell…" row above listing
 * results and the home page's verified shops.
 *
 * City proximity is not part of the score: it depends on who is asking, so it
 * is applied at query time (the `city` filter), never stored.
 */

/** Order history older than this no longer moves a shop's ranking. */
export const RANKING_WINDOW_DAYS = 90;

/** At most this many sponsored shops head a result page. */
export const SPONSORED_SLOTS = 2;
/** A shop below these cannot buy its way to the top. */
export const SPONSORED_MIN_LEVEL = 2;
export const SPONSORED_MIN_RATING = 4;
export const SPONSORED_MIN_REVIEWS = 3;

export interface ShopRankingSignals {
	/** Orders placed with the shop over `RANKING_WINDOW_DAYS`. */
	ordersPlaced: number;
	ordersAccepted: number;
	ordersDelivered: number;
	/** The newest published listing's last change, ISO. */
	catalogueUpdatedAt: string | null;
}

export interface ShopRankingInput extends ShopRankingSignals {
	active: boolean;
	effectiveLevel: number;
	/** The shop's own verified-purchase rating, 0-5. */
	rating: number;
	totalReviews: number;
	publishedListingCount: number;
}

const WEIGHT = { verification: 25, rating: 25, reliability: 25, catalogue: 25 };
const LEVEL_SHARE = [0, 0.3, 0.8, 1];
const RATING_PRIOR = 3.5;
const RATING_PRIOR_WEIGHT = 5;
const RATE_PRIOR = 0.8;
const RATE_PRIOR_WEIGHT = 5;
const FRESH_DAYS = 7;
const STALE_DAYS = 90;
const DAY_MS = 86_400_000;

const clamp01 = (value: number) =>
	Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const count = (value: number) =>
	Number.isFinite(value) && value > 0 ? value : 0;

/** A rate pulled towards the prior while the sample is small. */
function smoothedRate(hits: number, trials: number): number {
	const n = count(trials);
	return clamp01(
		(Math.min(count(hits), n) + RATE_PRIOR * RATE_PRIOR_WEIGHT) /
			(n + RATE_PRIOR_WEIGHT),
	);
}

function freshness(updatedAt: string | null, now: Date): number {
	if (!updatedAt) return 0;
	const at = Date.parse(updatedAt);
	if (!Number.isFinite(at)) return 0;
	const days = Math.max(0, (now.getTime() - at) / DAY_MS);
	if (days <= FRESH_DAYS) return 1;
	return clamp01(1 - (days - FRESH_DAYS) / (STALE_DAYS - FRESH_DAYS));
}

/** 0-100, two decimals. An inactive shop scores 0. */
export function shopRankingScore(
	input: ShopRankingInput,
	now: Date = new Date(),
): number {
	if (!input.active) return 0;

	const level = Math.max(0, Math.min(3, Math.floor(input.effectiveLevel)));
	const verification = LEVEL_SHARE[level] ?? 0;

	// Bayesian average: one 5-star review does not outrank fifty 4.8s.
	const reviews = count(input.totalReviews);
	const rating = Math.min(5, count(input.rating));
	const average =
		(rating * reviews + RATING_PRIOR * RATING_PRIOR_WEIGHT) /
		(reviews + RATING_PRIOR_WEIGHT);
	const volume = clamp01(Math.log10(1 + reviews) / 2);
	const ratingShare = clamp01((average - 1) / 4) * 0.8 + volume * 0.2;

	const acceptance = smoothedRate(input.ordersAccepted, input.ordersPlaced);
	const delivery = smoothedRate(input.ordersDelivered, input.ordersAccepted);
	const reliability = (acceptance + delivery) / 2;

	const listings = count(input.publishedListingCount);
	const catalogue =
		listings === 0
			? 0
			: clamp01(Math.log10(1 + listings) / Math.log10(51)) * 0.6 +
				freshness(input.catalogueUpdatedAt, now) * 0.4;

	const score =
		verification * WEIGHT.verification +
		ratingShare * WEIGHT.rating +
		reliability * WEIGHT.reliability +
		catalogue * WEIGHT.catalogue;
	return Math.round(score * 100) / 100;
}

/**
 * A paid placement. Empty `cities` / `categoryIds` mean "everywhere" /
 * "every category"; otherwise the slot only shows on a matching search.
 */
export interface ShopFeatured {
	until: string | null;
	cities: string[];
	categoryIds: string[];
}

export interface SponsorCandidate {
	active: boolean;
	effectiveLevel: number;
	rating: number;
	totalReviews: number;
	featured: ShopFeatured | null;
}

export interface SponsorContext {
	now: Date;
	city: string | null;
	/** The requested category and its descendants. */
	categoryIds: string[] | null;
}

const norm = (value: string) => value.trim().toLocaleLowerCase("fr");

export function isSponsorEligible(
	shop: SponsorCandidate,
	context: SponsorContext,
): boolean {
	const featured = shop.featured;
	if (!featured?.until) return false;
	const until = Date.parse(featured.until);
	if (!Number.isFinite(until) || until <= context.now.getTime()) return false;
	if (!shop.active || shop.effectiveLevel < SPONSORED_MIN_LEVEL) return false;
	if (
		shop.rating < SPONSORED_MIN_RATING ||
		shop.totalReviews < SPONSORED_MIN_REVIEWS
	)
		return false;
	if (featured.cities.length > 0) {
		if (!context.city) return false;
		const wanted = norm(context.city);
		if (!featured.cities.some((city) => norm(city) === wanted)) return false;
	}
	if (featured.categoryIds.length > 0) {
		if (!context.categoryIds?.length) return false;
		const wanted = new Set(context.categoryIds);
		if (!featured.categoryIds.some((id) => wanted.has(id))) return false;
	}
	return true;
}
