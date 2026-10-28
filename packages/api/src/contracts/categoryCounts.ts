/**
 * Category relevance by city: how many published listings each category
 * holds in the browsing city, its sub-categories included. Shared by the API
 * (which counts) and the web and mobile menus (which order and label with
 * it), so all three agree on when a city has enough to go by.
 */

/** GET /api/public/categories/counts?city= */
export interface CategoryCounts {
	city: string;
	/** Published listings in the city, all categories. */
	total: number;
	/** Per category id, its own listings and its descendants'. */
	counts: Record<string, number>;
}

/**
 * Below this many listings in the city the counts say more about chance
 * than about the city: the menus keep the editorial order.
 */
export const CATEGORY_COUNTS_MIN_TOTAL = 30;

/** How long a city's counts are reused: the menus should not reshuffle. */
export const CATEGORY_COUNTS_TTL_MS = 6 * 60 * 60 * 1000;

/** Whether these counts are worth ordering by. */
export function countsApply(
	counts: CategoryCounts | null | undefined,
): counts is CategoryCounts {
	return !!counts && counts.total >= CATEGORY_COUNTS_MIN_TOTAL;
}

/**
 * The categories, best stocked in the city first; equal counts keep their
 * editorial order, and empty ones go last. Unchanged when the counts do not
 * apply.
 */
export function rankByCounts<T extends { id: string }>(
	items: T[],
	counts: CategoryCounts | null | undefined,
): T[] {
	if (!countsApply(counts)) return items;
	const of = (item: T) => counts.counts[item.id] ?? 0;
	return items
		.map((item, index) => ({ item, index, count: of(item) }))
		.sort((a, b) => b.count - a.count || a.index - b.index)
		.map(({ item }) => item);
}

/** A category's count in the city, or null when the counts do not apply. */
export function countOf(
	id: string,
	counts: CategoryCounts | null | undefined,
): number | null {
	return countsApply(counts) ? (counts.counts[id] ?? 0) : null;
}

/**
 * Rolls listing counts per category (what the search facets on: the
 * category a listing is filed in) up to every ancestor.
 */
export function rollUpCounts(
	direct: Record<string, number>,
	parentOf: Map<string, string | null>,
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [id, n] of Object.entries(direct)) {
		const seen = new Set<string>();
		for (
			let at: string | null | undefined = id;
			at && !seen.has(at);
			at = parentOf.get(at)
		) {
			seen.add(at);
			out[at] = (out[at] ?? 0) + n;
		}
	}
	return out;
}
