import { CONDITION_SLUG } from "../../../api/src/contracts/conditionAttribute";

/** The item's condition code, read off the `condition` category attribute. */
export function listingConditionValue(attributes: unknown): string | null {
	if (
		!attributes ||
		typeof attributes !== "object" ||
		Array.isArray(attributes)
	)
		return null;
	const value = (attributes as Record<string, unknown>)[CONDITION_SLUG];
	return typeof value === "string" && value.trim() ? value : null;
}
