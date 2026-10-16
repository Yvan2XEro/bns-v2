export type ContentLocale = "fr" | "en";

let current: ContentLocale = "fr";

/**
 * The language the API answers category labels in: the app's own language,
 * sent as `Accept-Language` on every request and as `?locale=` to Payload's
 * REST routes, which read only that. Returns whether it changed, so cached
 * answers in the old language can be refetched.
 */
export function setContentLocale(language: string | undefined): boolean {
	const next: ContentLocale = language?.startsWith("en") ? "en" : "fr";
	const changed = next !== current;
	current = next;
	return changed;
}

export function contentLocale(): ContentLocale {
	return current;
}

export function withContentLocale(
	path: string,
	locale: ContentLocale = current,
): string {
	return `${path}${path.includes("?") ? "&" : "?"}locale=${locale}`;
}
