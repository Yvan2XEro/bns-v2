import type { Listing } from "~/types";

/** Grid of two rows of five on desktop. */
export const FRESH_COUNT = 10;
/** Boosted listings get these first places, badged, in place of their own section. */
export const BOOSTED_SLOTS = 3;
/** How many boosted listings to draw the slots from, so every boost gets its turn. */
export const BOOSTED_POOL = 12;

/**
 * The home's "Nouveautés": a few boosted listings picked at random from the
 * pool, then the newest listings, without repeating one.
 */
export function mixFreshListings(
	boosted: Listing[],
	recent: Listing[],
	random: () => number = Math.random,
): Listing[] {
	const pool = [...boosted];
	const picked: Listing[] = [];
	while (picked.length < BOOSTED_SLOTS && pool.length > 0) {
		const [listing] = pool.splice(Math.floor(random() * pool.length), 1);
		picked.push(listing);
	}
	const seen = new Set(picked.map((listing) => listing.id));
	const rest = recent.filter((listing) => !seen.has(listing.id));
	return [...picked, ...rest].slice(0, FRESH_COUNT);
}

/** The two reads behind the mix, optionally scoped to one city. */
export function freshListingPaths(city: string | null): {
	boosted: string;
	recent: string;
} {
	const location = city ? `&location=${encodeURIComponent(city)}` : "";
	return {
		boosted: `/api/public/search?limit=${BOOSTED_POOL}&boosted=true&sort=boosted${location}`,
		recent: `/api/public/search?limit=${FRESH_COUNT}&sort=newest${location}`,
	};
}
