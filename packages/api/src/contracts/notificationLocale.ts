/**
 * The languages notifications are written in, and the person's own, kept on
 * their account (`users.language`) because notifications leave while the app
 * is closed. Each client writes it from its own interface language; the API
 * hands it to every workflow as `payload.locale`, and each template picks its
 * wording with `localized()` (scripts/syncNotificationWorkflows.ts).
 *
 * Adding a language is adding it here: every `Localized` text then fails to
 * compile until it is translated.
 */
export const NOTIFICATION_LOCALES = ["fr", "en"] as const;
export type NotificationLocale = (typeof NOTIFICATION_LOCALES)[number];

export const DEFAULT_NOTIFICATION_LOCALE: NotificationLocale = "fr";

/** One text in every notification language. */
export type Localized = Record<NotificationLocale, string>;

export function isNotificationLocale(
	value: unknown,
): value is NotificationLocale {
	return (
		typeof value === "string" &&
		(NOTIFICATION_LOCALES as readonly string[]).includes(value)
	);
}

/** "en-GB" → "en"; anything unsupported → the default. */
export function notificationLocaleOf(value: unknown): NotificationLocale {
	const code =
		typeof value === "string"
			? value.trim().toLowerCase().split(/[-_]/)[0]
			: "";
	return isNotificationLocale(code) ? code : DEFAULT_NOTIFICATION_LOCALE;
}

/** The text in `locale`, for what the API writes itself (an SMS). */
export function inLocale(texts: Localized, locale: unknown): string {
	return texts[notificationLocaleOf(locale)];
}

/**
 * One template text in every language, chosen when Novu renders it from
 * `payload.locale`: a Liquid `if / elsif` over the other languages, the
 * default language in the `else` — so an event sent without a locale still
 * reads in the platform's default.
 */
export function localized(texts: Localized): string {
	const others = NOTIFICATION_LOCALES.filter(
		(locale) => locale !== DEFAULT_NOTIFICATION_LOCALE,
	);
	if (others.length === 0) return texts[DEFAULT_NOTIFICATION_LOCALE];
	const branches = others
		.map(
			(locale, index) =>
				`{% ${index === 0 ? "if" : "elsif"} payload.locale == '${locale}' %}${texts[locale]}`,
		)
		.join("");
	return `${branches}{% else %}${texts[DEFAULT_NOTIFICATION_LOCALE]}{% endif %}`;
}

/**
 * A text the API writes per event (a case title), sent as one payload field
 * per language — `caseTitle_fr`, `caseTitle_en` — since Novu payload values
 * are plain strings.
 */
export function localizedFields(
	name: string,
	texts: Localized,
): Record<string, string> {
	return Object.fromEntries(
		NOTIFICATION_LOCALES.map((locale) => [`${name}_${locale}`, texts[locale]]),
	);
}

/** The template side of `localizedFields`: picks the recipient's field. */
export function localizedField(name: string): string {
	return localized(
		Object.fromEntries(
			NOTIFICATION_LOCALES.map((locale) => [
				locale,
				`{{payload.${name}_${locale}}}`,
			]),
		) as Localized,
	);
}
