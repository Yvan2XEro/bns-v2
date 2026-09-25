/**
 * Quotes a value for a Meilisearch filter expression.
 *
 * A value carrying a double quote either broke the whole search or extended
 * the filter with whatever followed it. Every caller that splices a value
 * into a filter expression must go through this one place.
 */
export const quoteFilterValue = (value: string): string =>
	`"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
