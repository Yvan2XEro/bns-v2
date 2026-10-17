/**
 * Date helpers that never surface "Invalid Date" or NaN to the user.
 *
 * The API can return a missing, null or malformed `createdAt` (unpopulated
 * relations, partial documents, optimistic cache entries). Feeding those to
 * `new Date(...).toLocaleDateString()` renders a literal "Invalid Date", and
 * arithmetic on them renders NaN. Every helper here returns `null` instead so
 * callers can skip the row entirely.
 */

import i18next from "i18next";

/** Parses a date-ish value; returns null when it is missing or unparsable. */
export function parseDate(value: unknown): Date | null {
	if (value === null || value === undefined || value === "") return null;
	const d = value instanceof Date ? value : new Date(value as string);
	return Number.isNaN(d.getTime()) ? null : d;
}

/** The BCP 47 tag dates are written in: the app's language. */
export function appDateLocale(): string {
	return i18next.language?.startsWith("en") ? "en-GB" : "fr-FR";
}

/**
 * Locale date string, or null when the input is missing or invalid.
 * Defaults to the app's language.
 */
export function formatDate(
	value: unknown,
	options?: Intl.DateTimeFormatOptions,
	locale = appDateLocale(),
): string | null {
	const d = parseDate(value);
	return d ? d.toLocaleDateString(locale, options) : null;
}
