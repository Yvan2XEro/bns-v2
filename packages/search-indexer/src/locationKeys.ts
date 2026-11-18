/**
 * Folded forms of a listing's free-text `location`, so a city filter finds
 * "YAOUNDÉ", "yaounde" and "Akwa, Douala" alike. Kept identical to the API's
 * `lib/locationKeys.ts` (a parity test there imports this file).
 */
export function foldLocation(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[-_'’.]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** The whole value and each comma-separated part, folded, without repeats. */
export function locationKeys(value: unknown): string[] {
	if (typeof value !== "string") return [];
	const keys = [value, ...value.split(/[,/]/)]
		.map(foldLocation)
		.filter(Boolean);
	return Array.from(new Set(keys));
}
