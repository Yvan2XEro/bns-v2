/** U+202F, the narrow no-break space French typography uses between a
 * digit group and the currency symbol; a plain space is a different
 * character and would silently change the rendered amount. */
const NARROW_NBSP = " ";

/**
 * Display-only mirror of `formatXaf` in `packages/api/src/lib/orderFormat.ts`
 * — `"47 000 FCFA"` in French (narrow no-break space), `"XAF 47,000"` in
 * English. `packages/api/tests/int/order-format-parity.int.spec.ts` runs
 * this, web's copy and the API's original over a fixed table and asserts
 * all three agree string for string.
 */
export function formatXaf(amount: number, locale: "fr" | "en"): string {
	const grouped = Math.trunc(Math.abs(amount))
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, locale === "fr" ? NARROW_NBSP : ",");
	const sign = amount < 0 ? "-" : "";
	return locale === "fr" ? `${sign}${grouped} FCFA` : `${sign}XAF ${grouped}`;
}

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
