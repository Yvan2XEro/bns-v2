import type { MarketConfig } from "../../../api/src/contracts/marketConfig";
import {
	formatMoney,
	formatMoneyFallback,
} from "../../../api/src/contracts/money";

/**
 * The amount in the market's served format for `locale`. A locale with no
 * served row falls back to the explicit code-first form (M9) built from the
 * market's own currency; with no market block at all there is no currency to
 * name, so only the grouped number is shown.
 */
export function renderOrderMoney(
	market: Pick<MarketConfig, "formats" | "currency"> | undefined,
	amount: number | null | undefined,
	locale: string,
): string {
	if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
	if (!market) return new Intl.NumberFormat(locale).format(Math.trunc(amount));
	const format = market.formats.find((f) => f.locale === locale);
	return format
		? formatMoney(amount, format)
		: formatMoneyFallback(
				amount,
				market.currency.code,
				market.currency.minorUnit,
			);
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

export function formatOrderMoneyRange(
	format: (amount: number | null | undefined) => string,
	min: number | null | undefined,
	max: number | null | undefined,
): string {
	if (typeof min !== "number") return format(max);
	if (typeof max !== "number" || max === min) return format(min);
	return `${format(min)} – ${format(max)}`;
}
