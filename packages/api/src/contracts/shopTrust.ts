/**
 * The trust strip under a shop's name, shared by the web and mobile shop
 * pages. The API fills `ShopTrust`; `shopTrustItems` decides what is shown.
 */

export const SHOP_RESPONSE_TIMES = [
	"under_1h",
	"under_3h",
	"same_day",
	"few_days",
] as const;
export type ShopResponseTime = (typeof SHOP_RESPONSE_TIMES)[number];

/** Fewer answered-or-expired buyer bursts than this in the window: no claim. */
export const RESPONSE_TIME_SAMPLE_FLOOR = 5;
export const RESPONSE_TIME_WINDOW_DAYS = 30;

/** Under 30 days old, or under 90 days old without a single review yet. */
export const NEW_SHOP_DAYS = 30;
export const NEW_SHOP_UNREVIEWED_DAYS = 90;

export interface ShopTrust {
	/** Bucket of the median first reply to a buyer over the last 30 days; null below the sample floor. */
	responseTime: ShopResponseTime | null;
	/** Published listings. */
	activeListings: number;
	/** ISO date the shop was created. */
	memberSince: string;
	isNew: boolean;
}

const DAY_MS = 86_400_000;

/**
 * `minutes` holds one reply delay per buyer burst; a burst left unanswered
 * past the 24 h deadline counts as `Infinity`, so silence pulls the median up
 * instead of disappearing from it.
 */
export function shopResponseTimeOf(
	minutes: readonly number[],
): ShopResponseTime | null {
	if (minutes.length < RESPONSE_TIME_SAMPLE_FLOOR) return null;
	const sorted = [...minutes].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	const median =
		sorted.length % 2
			? (sorted[middle] ?? Number.POSITIVE_INFINITY)
			: ((sorted[middle - 1] ?? 0) +
					(sorted[middle] ?? Number.POSITIVE_INFINITY)) /
				2;
	if (median <= 60) return "under_1h";
	if (median <= 180) return "under_3h";
	if (median <= 24 * 60) return "same_day";
	return "few_days";
}

export function isNewShop(
	createdAt: string,
	totalReviews: number,
	now: Date = new Date(),
): boolean {
	const created = Date.parse(createdAt);
	if (!Number.isFinite(created)) return false;
	const ageDays = (now.getTime() - created) / DAY_MS;
	return (
		ageDays < NEW_SHOP_DAYS ||
		(ageDays < NEW_SHOP_UNREVIEWED_DAYS && totalReviews === 0)
	);
}

export type ShopTrustItem =
	| { kind: "rating"; rating: number; count: number }
	| { kind: "responseTime"; bucket: ShopResponseTime }
	| { kind: "city"; city: string }
	| { kind: "memberSince"; year: number }
	| { kind: "newShop" }
	| { kind: "activeListings"; count: number };

/**
 * The strip's items in display order. Never a zero or empty stat: no rating
 * without a review, no response time below the sample floor, no listing
 * count at 0. A new shop shows « Nouvelle boutique » in place of its year;
 * an older one with nothing else to show still has its year.
 *
 * Suggested message keys per kind (fr/en in each client): `rating`,
 * `responseTime.<bucket>`, `city`, `memberSince`, `newShop`, `activeListings`.
 */
export function shopTrustItems(input: {
	trust: ShopTrust;
	city: string | null;
	rating: { value: number; count: number } | null;
}): ShopTrustItem[] {
	const { trust, city, rating } = input;
	const items: ShopTrustItem[] = [];
	if (rating && rating.count > 0 && rating.value > 0)
		items.push({ kind: "rating", rating: rating.value, count: rating.count });
	if (trust.responseTime)
		items.push({ kind: "responseTime", bucket: trust.responseTime });
	const place = city?.trim();
	if (place) items.push({ kind: "city", city: place });
	const year = new Date(trust.memberSince).getFullYear();
	if (trust.isNew) items.push({ kind: "newShop" });
	else if (Number.isFinite(year)) items.push({ kind: "memberSince", year });
	if (trust.activeListings > 0)
		items.push({ kind: "activeListings", count: trust.activeListings });
	return items;
}
