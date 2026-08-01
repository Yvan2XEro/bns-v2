/**
 * Date helpers that never surface "Invalid Date" or NaN to the user.
 *
 * The API can return a missing, null or malformed `createdAt` (unpopulated
 * relations, partial documents, optimistic cache entries). Feeding those to
 * `new Date(...).toLocaleDateString()` renders a literal "Invalid Date", and
 * arithmetic on them renders NaN. Every helper here returns `null` instead so
 * callers can skip the row entirely.
 */

/** Parses a date-ish value; returns null when it is missing or unparsable. */
export function parseDate(value: unknown): Date | null {
	if (value === null || value === undefined || value === "") return null;
	const d = value instanceof Date ? value : new Date(value as string);
	return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Locale date string, or null when the input is missing or invalid.
 * Defaults to "fr-FR" to match the rest of the app.
 */
export function formatDate(
	value: unknown,
	options?: Intl.DateTimeFormatOptions,
	locale = "fr-FR",
): string | null {
	const d = parseDate(value);
	return d ? d.toLocaleDateString(locale, options) : null;
}
