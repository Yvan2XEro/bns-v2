import { keepApplicableTags } from "../../../api/src/contracts/listingTags";

export interface CategoryTag {
	id: string;
	name: string;
	slug: string;
	emoji?: string;
}

/** The endpoint answering the tags a category gets; null without a category. */
export function categoryTagsPath(
	categoryId: string | null | undefined,
): string | null {
	return categoryId
		? `/api/public/tags?category=${encodeURIComponent(categoryId)}`
		: null;
}

export function normalizeCategoryTags(data: unknown): CategoryTag[] {
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
				...(typeof emoji === "string" && emoji ? { emoji } : {}),
			},
		];
	});
}

/** The selection minus what no longer applies; the same array when nothing goes. */
export function pruneTagIds(
	selected: string[],
	applicable: readonly string[],
): string[] {
	const kept = keepApplicableTags(selected, applicable);
	return kept.length === selected.length ? selected : kept;
}

/** Same for a search filter, which holds slugs. */
export function pruneTagSlugs(
	selected: string[],
	tags: readonly CategoryTag[],
): string[] {
	return pruneTagIds(
		selected,
		tags.map((tag) => tag.slug),
	);
}
