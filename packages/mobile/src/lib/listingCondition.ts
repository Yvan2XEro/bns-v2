import type { ListingCondition } from "@/src/types/api";

/** i18n key for each stored condition value — the API stores `like_new`. */
export const CONDITION_LABEL_KEYS: Record<ListingCondition, string> = {
	new: "conditions.new",
	like_new: "conditions.likeNew",
	good: "conditions.good",
	fair: "conditions.fair",
	poor: "conditions.poor",
};

/** The label key for a stored condition, or null for an unknown value. */
export function conditionLabelKey(value: unknown): string | null {
	return typeof value === "string" && value in CONDITION_LABEL_KEYS
		? CONDITION_LABEL_KEYS[value as ListingCondition]
		: null;
}
