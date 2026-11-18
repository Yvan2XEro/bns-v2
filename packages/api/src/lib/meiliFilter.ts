import { foldLocation } from "./locationKeys";

/**
 * Quotes a value for a Meilisearch filter expression.
 *
 * A value carrying a double quote either broke the whole search or extended
 * the filter with whatever followed it. Every caller that splices a value
 * into a filter expression must go through this one place.
 */
export const quoteFilterValue = (value: string): string =>
	`"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * A city filter that also finds "YAOUNDÉ" or "Akwa, Douala" for "Yaoundé",
 * through the indexer's folded `locationKeys`; the exact `location` match
 * keeps documents indexed before those keys existed.
 */
export function locationFilter(location: string): string {
	const exact = `location = ${quoteFilterValue(location)}`;
	const key = foldLocation(location);
	return key ? `(locationKeys = ${quoteFilterValue(key)} OR ${exact})` : exact;
}
