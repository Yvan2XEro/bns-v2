export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/** Each language named in itself, so a reader finds theirs whatever the page's language. */
export const LOCALE_NAMES: Record<Locale, string> = {
	fr: "Français",
	en: "English",
};

export function isLocale(value: string): value is Locale {
	return (LOCALES as readonly string[]).includes(value);
}
