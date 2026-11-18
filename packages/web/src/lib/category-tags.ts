import {
	keepApplicableTags,
	relationIds,
} from "../../../api/src/contracts/listingTags";

export { keepApplicableTags, relationIds };

export interface TagItem {
	id: string;
	name: string;
	slug: string;
	emoji?: string | null;
}

/** Where the tags a category gets are read; null when there is no category to ask about. */
export function categoryTagsUrl(categoryId: string | null | undefined) {
	return categoryId
		? `/api/public/tags?category=${encodeURIComponent(categoryId)}`
		: null;
}

/** The answer of the tags route, with anything malformed left out. */
export function parseTagItems(data: unknown): TagItem[] {
	if (!Array.isArray(data)) return [];
	return data.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const { id, name, slug, emoji } = entry as Record<string, unknown>;
		if (typeof id !== "string" || typeof slug !== "string") return [];
		return [
			{
				id,
				slug,
				name: typeof name === "string" ? name : slug,
				emoji: typeof emoji === "string" ? emoji : null,
			},
		];
	});
}

/**
 * The tag slugs a search keeps: only those the category gets. `null` means
 * the category's tags are still loading, and the selection is left alone.
 */
export function scopedTagSlugs(
	selected: readonly string[],
	applicable: readonly TagItem[] | null,
): string[] {
	if (!applicable) return [...selected];
	const slugs = new Set(applicable.map((tag) => tag.slug));
	return selected.filter((slug) => slugs.has(slug));
}
