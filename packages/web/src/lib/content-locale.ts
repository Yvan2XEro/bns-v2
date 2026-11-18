import { DEFAULT_LOCALE, isLocale, type Locale } from "~/i18n/locales";

/**
 * The language the API should answer category labels in. The web app keeps
 * the reader's choice in the `NEXT_LOCALE` cookie; the API reads it from
 * `Accept-Language` (custom routes) or `?locale=` (Payload's own REST routes).
 */
export function localeFromCookies(cookie: string | null | undefined): Locale {
	const match = cookie?.match(/(?:^|;\s*)NEXT_LOCALE=([^;]*)/);
	const value = match ? decodeURIComponent(match[1]) : "";
	return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function browserContentLocale(): Locale {
	return typeof document === "undefined"
		? DEFAULT_LOCALE
		: localeFromCookies(document.cookie);
}

export function contentLocaleHeaders(locale: Locale): {
	"Accept-Language": Locale;
} {
	return { "Accept-Language": locale };
}

/** Appends `locale=` to an API path, for Payload's REST routes. */
export function withContentLocale(path: string, locale: Locale): string {
	return `${path}${path.includes("?") ? "&" : "?"}locale=${locale}`;
}
