import type { MarketConfig } from "../../../api/src/contracts/marketConfig";
import {
	formatMoney,
	formatMoneyFallback,
	type MoneyFormat,
} from "../../../api/src/contracts/money";

type Locale = "fr" | "en";

// Pre-migration APIs serve no market block; amounts then render with the
// explicit M9 fallback instead of guessing a country.
const FALLBACK_CURRENCY = { code: "XAF", minorUnit: 0 };
const FALLBACK_EXAMPLE = "+CCXXXXXXXX";
const FALLBACK_PHONE = /^\+\d{8,15}$/;

let current: MarketConfig | undefined;

export function setMarket(market: MarketConfig | undefined): void {
	current = market;
}

function localeOf(lang?: string): Locale {
	return lang?.startsWith("en") ? "en" : "fr";
}

function pickFormat(
	formats: MoneyFormat[],
	locale: Locale,
): MoneyFormat | undefined {
	return formats.find((f) => f.locale === locale);
}

export function formatPrice(amount: number, lang?: string): string {
	const market = current;
	const format = market && pickFormat(market.formats, localeOf(lang));
	if (market && format) return formatMoney(amount, format);
	const currency = market?.currency ?? FALLBACK_CURRENCY;
	return formatMoneyFallback(amount, currency.code, currency.minorUnit);
}

export function formatPriceRange(
	min: number,
	max: number,
	lang?: string,
): string {
	if (min === max) return formatPrice(min, lang);
	return `${formatPrice(min, lang)} – ${formatPrice(max, lang)}`;
}

export function isMarketPhone(text: string): boolean {
	const pattern = current?.phone.pattern;
	if (!pattern) return FALLBACK_PHONE.test(text);
	try {
		return new RegExp(pattern).test(text);
	} catch {
		return FALLBACK_PHONE.test(text);
	}
}

export function currencyCode(): string {
	return (current?.currency ?? FALLBACK_CURRENCY).code;
}

/** The market's own currency mark for an amount field's suffix ("FCFA",
 * "₦"…), in the reader's language; the ISO code when no format is served. */
export function currencySymbol(lang?: string): string {
	const format = current && pickFormat(current.formats, localeOf(lang));
	return format?.symbol ?? currencyCode();
}

export function phoneExample(): string {
	return current?.phone.displayExample ?? FALLBACK_EXAMPLE;
}
