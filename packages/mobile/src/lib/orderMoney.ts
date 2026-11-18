/**
 * A short, human date for an order timeline — `"3 oct. 2026"` in French,
 * `"Oct 3, 2026"` in English. Not part of the cross-package parity spec: no
 * screen task needs the API and the clients to render a date byte-identical,
 * only readable.
 */
export function formatOrderDate(
	date: string | number | Date,
	locale: "fr" | "en",
): string {
	const value = date instanceof Date ? date : new Date(date);
	return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(value);
}
