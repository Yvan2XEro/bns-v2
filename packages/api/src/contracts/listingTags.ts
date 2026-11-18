import type { FieldIssue } from "./formIssues";

/**
 * Tags are scoped to categories: a tag applies to a category when that
 * category or one of its ancestors is listed on the tag, and a tag that lists
 * no category applies nowhere. The Listings hook, the public tags route and
 * both clients run these functions, so a form never offers or sends a tag the
 * server would refuse.
 */

const idOf = (value: unknown): string | null => {
	if (typeof value === "string" && value) return value;
	if (typeof value === "number") return String(value);
	if (value && typeof value === "object" && "id" in value) {
		return idOf((value as { id?: unknown }).id);
	}
	return null;
};

/** The ids of a relationship value: populated docs, bare ids or a mix. */
export function relationIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map(idOf).filter((id): id is string => id !== null);
}

/** `chain` is the listing's category followed by its ancestors. */
export function tagAppliesToCategory(
	tagCategories: unknown,
	chain: readonly string[],
): boolean {
	const scope = relationIds(tagCategories);
	return scope.some((id) => chain.includes(id));
}

/** One issue on `tags` when any selected tag is not among `applicable`. */
export function listingTagIssues(
	selected: unknown,
	applicable: readonly string[],
): FieldIssue[] {
	const allowed = new Set(applicable);
	const refused = relationIds(selected).filter((id) => !allowed.has(id));
	return refused.length > 0
		? [{ path: "tags", rule: "category", params: { count: refused.length } }]
		: [];
}

/** What a form keeps of its selection once the category changes. */
export function keepApplicableTags(
	selected: readonly string[],
	applicable: readonly string[],
): string[] {
	const allowed = new Set(applicable);
	return selected.filter((id) => allowed.has(id));
}
