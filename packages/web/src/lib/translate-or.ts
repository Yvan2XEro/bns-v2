/**
 * next-intl helper for keys that are not in `messages/*.json` yet.
 *
 * The listing form needs a handful of new strings, but the message catalogues
 * are owned elsewhere. `translateOr` still routes every string through
 * next-intl: it uses the catalogue entry as soon as one exists, and renders a
 * readable literal until then, instead of leaking a raw key path such as
 * "Listing.attributeRequired" into the UI.
 *
 * Once the keys land in the catalogues, the fallbacks become dead weight and
 * the calls can collapse to plain `t(key)`.
 */

export interface FallbackTranslator {
	(key: string, values?: Record<string, string | number>): string;
	has(key: string): boolean;
}

/** Structural cast: message keys are untyped in this app, so this is safe. */
export function asFallbackTranslator(t: unknown): FallbackTranslator {
	return t as FallbackTranslator;
}

function interpolate(
	template: string,
	values?: Record<string, string | number>,
): string {
	if (!values) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in values ? String(values[name]) : match,
	);
}

export function translateOr(
	t: FallbackTranslator,
	key: string,
	fallback: string,
	values?: Record<string, string | number>,
): string {
	if (t.has(key)) return t(key, values);
	return interpolate(fallback, values);
}
