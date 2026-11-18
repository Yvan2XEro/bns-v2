/**
 * What the search boxes offer before a search is run: the buyer's own recent
 * searches, and the categories whose name (or seller vocabulary) matches what
 * is being typed. Shared by web and mobile so both suggest the same things.
 */

/** Fewer characters than this match half the catalogue: nothing is suggested. */
export const SUGGEST_MIN_CHARS = 2;
export const RECENT_SEARCHES_MAX = 8;
export const CATEGORY_SUGGESTIONS_MAX = 3;
export const SHOP_SUGGESTIONS_MAX = 3;

/** Lowercase, accents folded, spaces collapsed: "Télé  LED" → "tele led". */
export function foldSearchText(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * The recent-search list once `query` has been run: newest first, the same
 * search typed again moved up rather than repeated, capped at `max`. A query
 * too short to have been meant is not remembered.
 */
export function rememberSearch(
	previous: readonly string[],
	query: string,
	max: number = RECENT_SEARCHES_MAX,
): string[] {
	const trimmed = query.replace(/\s+/g, " ").trim();
	if (trimmed.length < SUGGEST_MIN_CHARS) return [...previous];
	const key = foldSearchText(trimmed);
	return [
		trimmed,
		...previous.filter((entry) => foldSearchText(entry) !== key),
	].slice(0, max);
}

/** Parses a stored list defensively: anything that is not a list of strings is no history. */
export function parseRecentSearches(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((entry): entry is string => typeof entry === "string")
		.slice(0, RECENT_SEARCHES_MAX);
}

export interface SuggestibleCategoryName {
	name: string;
	searchAliases?: string | null;
}

function words(value: string): string[] {
	return foldSearchText(value)
		.split(/[\s,/&'-]+/)
		.filter(Boolean);
}

/**
 * How well a category answers what is being typed: its name starting with the
 * query beats one of its words starting with it, which beats a seller alias
 * ("bagnole" → Voitures). 0 when nothing matches.
 */
function categoryScore(
	category: SuggestibleCategoryName,
	query: string,
): number {
	const name = foldSearchText(category.name);
	if (name.startsWith(query)) return 3;
	if (words(category.name).some((word) => word.startsWith(query))) return 2;
	const aliases = (category.searchAliases ?? "")
		.split(",")
		.map(foldSearchText)
		.filter(Boolean);
	if (aliases.some((alias) => alias.startsWith(query))) return 1;
	return 0;
}

/**
 * The categories worth offering for `query`, best first; the shorter name wins
 * a tie, being the closer match. Empty below `SUGGEST_MIN_CHARS`.
 */
export function matchCategories<T extends SuggestibleCategoryName>(
	categories: readonly T[],
	query: string,
	max: number = CATEGORY_SUGGESTIONS_MAX,
): T[] {
	const folded = foldSearchText(query);
	if (folded.length < SUGGEST_MIN_CHARS) return [];
	return categories
		.map((category) => ({ category, score: categoryScore(category, folded) }))
		.filter((entry) => entry.score > 0)
		.sort(
			(a, b) =>
				b.score - a.score || a.category.name.length - b.category.name.length,
		)
		.slice(0, max)
		.map((entry) => entry.category);
}
