import type { PlacePreferences } from "./place-preferences";

/**
 * The browsing city, mirrored from the browser's place preferences into a
 * cookie so the server renders the home's "Nouveautés" for it on the first
 * paint. Absent means the server does not know: it renders every city and
 * the browser applies its own preference, as before.
 */
export const BROWSE_CITY_COOKIE = "bns_browse_city";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const MAX_CITY_LENGTH = 120;

export function browseCityOf(
	prefs: Pick<PlacePreferences, "place" | "browseAll">,
): string | null {
	return prefs.browseAll ? null : (prefs.place?.name.trim() ?? null) || null;
}

/** A `document.cookie` assignment: sets the city, or clears it for "all cities". */
export function browseCityCookie(city: string | null): string {
	const base = `${BROWSE_CITY_COOKIE}=`;
	const attributes = "; Path=/; SameSite=Lax";
	return city
		? `${base}${encodeURIComponent(city)}${attributes}; Max-Age=${MAX_AGE_SECONDS}`
		: `${base}${attributes}; Max-Age=0`;
}

/** The city a cookie value names, or null for anything empty or unreadable. */
export function readBrowseCity(
	value: string | null | undefined,
): string | null {
	if (!value) return null;
	try {
		const city = decodeURIComponent(value).trim();
		return city && city.length <= MAX_CITY_LENGTH ? city : null;
	} catch {
		return null;
	}
}

/** The cookie's current value in `document.cookie`, undecoded. */
export function browseCityCookieValue(cookieHeader: string): string | null {
	for (const part of cookieHeader.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name === BROWSE_CITY_COOKIE) return rest.join("=");
	}
	return null;
}
