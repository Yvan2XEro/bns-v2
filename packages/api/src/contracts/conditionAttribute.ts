/**
 * An item's condition is an ordinary category attribute: the categories that
 * ask for it carry a select under the `condition` slug (or an admin's own
 * "État" attribute). These read it back the same way on the API and both
 * clients — order snapshots, listing cards, the search filter.
 */

export const CONDITION_SLUG = "condition";

export const CONDITION_VALUES = [
	"new",
	"like_new",
	"good",
	"fair",
	"poor",
] as const;

export type ConditionValue = (typeof CONDITION_VALUES)[number];

export const CONDITION_LABELS_FR: Record<ConditionValue, string> = {
	new: "Neuf",
	like_new: "Comme neuf",
	good: "Bon état",
	fair: "État correct",
	poor: "Mauvais état",
};

export interface ConditionAttributeDef {
	slug?: unknown;
	name?: unknown;
	type?: unknown;
	options?: unknown;
}

/**
 * A label's text: the string itself, or the French of a `{ fr, en }` label
 * read straight from the database (the default locale), the English when no
 * French is stored.
 */
export function labelText(value: unknown): string {
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && !Array.isArray(value)) {
		const { fr, en } = value as { fr?: unknown; en?: unknown };
		if (typeof fr === "string" && fr.trim()) return fr;
		if (typeof en === "string") return en;
	}
	return "";
}

export const normalizeWord = (value: unknown): string =>
	labelText(value)
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[\s_-]+/g, " ")
		.trim();

const CONDITION_NAMES = new Set([
	"condition",
	"etat",
	"state",
	"item condition",
	"product condition",
	"etat du produit",
	"etat de l article",
	"etat de l'article",
]);

const englishOf = (value: unknown): unknown =>
	value && typeof value === "object" ? (value as { en?: unknown }).en : null;

/** A select or text attribute that asks how worn the item is. */
export function isConditionLikeAttribute(def: ConditionAttributeDef): boolean {
	if (def.type !== "select" && def.type !== "text") return false;
	return (
		CONDITION_NAMES.has(normalizeWord(def.slug)) ||
		CONDITION_NAMES.has(normalizeWord(def.name)) ||
		CONDITION_NAMES.has(normalizeWord(englishOf(def.name)))
	);
}

export function conditionAttributeOf<T extends ConditionAttributeDef>(
	defs: readonly T[] | null | undefined,
): T | null {
	return (defs ?? []).find(isConditionLikeAttribute) ?? null;
}

function optionLabel(options: unknown, value: string): string | null {
	if (!Array.isArray(options)) return null;
	for (const option of options) {
		if (typeof option === "string" && option === value) return option;
		if (option && typeof option === "object") {
			const row = option as { value?: unknown; label?: unknown };
			if (row.value !== value) continue;
			const label = labelText(row.label);
			return label.trim() ? label : value;
		}
	}
	return null;
}

/**
 * The condition as a person reads it: the option's label when the category
 * defines one, the stored value otherwise. Null when the item has none.
 */
export function conditionLabelOf(
	defs: readonly ConditionAttributeDef[] | null | undefined,
	values: unknown,
): string | null {
	if (!values || typeof values !== "object" || Array.isArray(values)) {
		return null;
	}
	const def = conditionAttributeOf(defs);
	const slug = typeof def?.slug === "string" ? def.slug : CONDITION_SLUG;
	const raw = (values as Record<string, unknown>)[slug];
	if (typeof raw !== "string" || !raw.trim()) return null;
	return (
		optionLabel(def?.options, raw) ??
		(CONDITION_VALUES.includes(raw as ConditionValue)
			? CONDITION_LABELS_FR[raw as ConditionValue]
			: raw)
	);
}
