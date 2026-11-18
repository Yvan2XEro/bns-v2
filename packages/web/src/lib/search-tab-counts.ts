/**
 * The search page's two tabs read one set of URL parameters: the listing
 * tab's (`location`, `verified`, prices, tags, `attr_*`) and the shop tab's
 * (`city`, `level`). The filters both understand — text, city, category and
 * shop level — carry across, so each tab's count, and the page its link
 * opens, answer the same search.
 */
type PageParams = Record<string, string | undefined>;

export interface SharedSearchFilters {
	q: string;
	city: string;
	category: string;
	/** 0 for every level, otherwise the shop-level floor. */
	level: number;
}

export function sharedSearchFilters(params: PageParams): SharedSearchFilters {
	const level = Number.parseInt(params.level ?? "", 10);
	return {
		q: params.q?.trim() ?? "",
		city: (params.location || params.city || "").trim(),
		category: params.category ?? "",
		level: level >= 1 && level <= 3 ? level : params.verified === "1" ? 2 : 0,
	};
}

/** The listing tab only offers "verified shops", a floor of 2. */
const listingLevelFloor = (level: number) => (level >= 2 ? 2 : 0);

/** `/api/public/search` parameters for a page's listing search. */
export function listingSearchParams(params: PageParams): URLSearchParams {
	const shared = sharedSearchFilters(params);
	const out = new URLSearchParams();
	if (shared.q) out.set("q", shared.q);
	if (shared.category) out.set("category", shared.category);
	if (params.minPrice) out.set("minPrice", params.minPrice);
	if (params.maxPrice) out.set("maxPrice", params.maxPrice);
	if (shared.city) out.set("location", shared.city);
	if (shared.category && params.tags) out.set("tags", params.tags);
	if (params.condition) out.set("condition", params.condition);
	for (const [key, value] of Object.entries(params)) {
		if (key.startsWith("attr_") && value) out.set(key, value);
	}
	const floor = listingLevelFloor(shared.level);
	if (floor) out.set("minShopLevel", String(floor));
	return out;
}

/** `/api/public/search/shops` parameters for a page's shop search. */
export function shopSearchParams(params: PageParams): URLSearchParams {
	const shared = sharedSearchFilters(params);
	const out = new URLSearchParams();
	if (shared.q) out.set("q", shared.q);
	if (shared.city) out.set("city", shared.city);
	if (shared.category) out.set("category", shared.category);
	if (shared.level) out.set("minShopLevel", String(shared.level));
	return out;
}

/** A count only: `limit=0` makes the API skip the hits. */
export function tabCountPaths(params: PageParams): {
	listings: string;
	shops: string;
} {
	const listings = listingSearchParams(params);
	listings.set("limit", "0");
	const shops = shopSearchParams(params);
	shops.set("limit", "0");
	return {
		listings: `/api/public/search?${listings.toString()}`,
		shops: `/api/public/search/shops?${shops.toString()}`,
	};
}

/** Each tab's link, keeping the filters the other tab understands. */
export function searchTabHrefs(params: PageParams): {
	listings: string;
	shops: string;
} {
	const shared = sharedSearchFilters(params);
	const listings = new URLSearchParams();
	if (shared.q) listings.set("q", shared.q);
	if (shared.category) listings.set("category", shared.category);
	if (shared.city) listings.set("location", shared.city);
	if (listingLevelFloor(shared.level)) listings.set("verified", "1");
	const shops = new URLSearchParams({ tab: "shops" });
	if (shared.q) shops.set("q", shared.q);
	if (shared.city) shops.set("city", shared.city);
	if (shared.level) shops.set("level", String(shared.level));
	if (shared.category) shops.set("category", shared.category);
	const query = listings.toString();
	return {
		listings: query ? `/search?${query}` : "/search",
		shops: `/search?${shops.toString()}`,
	};
}
