import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { CAMEROON_CITIES } from "./cameroon-cities";

/**
 * Place lookup for the whole world, without bundling a world-cities dataset.
 *
 * Three sources, cheapest first:
 *   1. `SEED_PLACES` — the Cameroon list (the dense market) plus a short list of
 *      major world cities. Always available, works offline, ~10 KB.
 *   2. Recently picked places, persisted on device. The list becomes genuinely
 *      worldwide for each user as they use the app, at zero data cost.
 *   3. The OS geocoder (`expo-location`), which needs no API key. It is only
 *      consulted when it is actually usable — see `isGeocoderUsable()` — and a
 *      failure is never surfaced as an error, it just yields no extra rows.
 *
 * Everything degrades to "the text the user typed": `Listings.location` is a
 * free-text field on the API and the search filter is a `contains` match, so a
 * place that no source knows about is still a valid, searchable value.
 */

export type PlaceSource = "seed" | "recent" | "device" | "geocoder" | "custom";

export interface Place {
	/** City or town name, as displayed and as stored in `listing.location`. */
	name: string;
	/** State / province / administrative region. Empty string when unknown. */
	region: string;
	/** Localised country name, when known. */
	country?: string;
	/** ISO 3166-1 alpha-2, uppercase. */
	countryCode?: string;
	lat?: number;
	lng?: number;
	source: PlaceSource;
}

const RECENT_PLACES_KEY = "places_recent_v1";
const MAX_RECENT_PLACES = 8;

// ─── Seed data ────────────────────────────────────────────────────────────────

const CAMEROON_SEED: Place[] = CAMEROON_CITIES.map((city) => ({
	name: city.name,
	region: city.region,
	country: "Cameroun",
	countryCode: "CM",
	lat: city.lat,
	lng: city.lng,
	source: "seed" as const,
}));

/**
 * A deliberately short global list — enough that the picker is not empty for a
 * user outside Cameroon before the geocoder answers. It is a fallback, not a
 * dataset: anything missing is covered by the geocoder and by free text.
 */
const WORLD_SEED: Place[] = [
	{
		name: "Abidjan",
		region: "Abidjan",
		country: "Côte d'Ivoire",
		countryCode: "CI",
		lat: 5.36,
		lng: -4.0083,
	},
	{
		name: "Abuja",
		region: "FCT",
		country: "Nigeria",
		countryCode: "NG",
		lat: 9.0765,
		lng: 7.3986,
	},
	{
		name: "Accra",
		region: "Greater Accra",
		country: "Ghana",
		countryCode: "GH",
		lat: 5.6037,
		lng: -0.187,
	},
	{
		name: "Addis-Abeba",
		region: "Addis Ababa",
		country: "Éthiopie",
		countryCode: "ET",
		lat: 9.0192,
		lng: 38.7525,
	},
	{
		name: "Alger",
		region: "Alger",
		country: "Algérie",
		countryCode: "DZ",
		lat: 36.7538,
		lng: 3.0588,
	},
	{
		name: "Amsterdam",
		region: "Noord-Holland",
		country: "Pays-Bas",
		countryCode: "NL",
		lat: 52.3676,
		lng: 4.9041,
	},
	{
		name: "Atlanta",
		region: "Georgia",
		country: "États-Unis",
		countryCode: "US",
		lat: 33.749,
		lng: -84.388,
	},
	{
		name: "Bangui",
		region: "Bangui",
		country: "Centrafrique",
		countryCode: "CF",
		lat: 4.3947,
		lng: 18.5582,
	},
	{
		name: "Barcelone",
		region: "Catalogne",
		country: "Espagne",
		countryCode: "ES",
		lat: 41.3874,
		lng: 2.1686,
	},
	{
		name: "Berlin",
		region: "Berlin",
		country: "Allemagne",
		countryCode: "DE",
		lat: 52.52,
		lng: 13.405,
	},
	{
		name: "Bruxelles",
		region: "Bruxelles-Capitale",
		country: "Belgique",
		countryCode: "BE",
		lat: 50.8503,
		lng: 4.3517,
	},
	{
		name: "Le Caire",
		region: "Le Caire",
		country: "Égypte",
		countryCode: "EG",
		lat: 30.0444,
		lng: 31.2357,
	},
	{
		name: "Cape Town",
		region: "Western Cape",
		country: "Afrique du Sud",
		countryCode: "ZA",
		lat: -33.9249,
		lng: 18.4241,
	},
	{
		name: "Casablanca",
		region: "Casablanca-Settat",
		country: "Maroc",
		countryCode: "MA",
		lat: 33.5731,
		lng: -7.5898,
	},
	{
		name: "Conakry",
		region: "Conakry",
		country: "Guinée",
		countryCode: "GN",
		lat: 9.6412,
		lng: -13.5784,
	},
	{
		name: "Cotonou",
		region: "Littoral",
		country: "Bénin",
		countryCode: "BJ",
		lat: 6.3703,
		lng: 2.3912,
	},
	{
		name: "Dakar",
		region: "Dakar",
		country: "Sénégal",
		countryCode: "SN",
		lat: 14.7167,
		lng: -17.4677,
	},
	{
		name: "Dubaï",
		region: "Dubaï",
		country: "Émirats arabes unis",
		countryCode: "AE",
		lat: 25.2048,
		lng: 55.2708,
	},
	{
		name: "Genève",
		region: "Genève",
		country: "Suisse",
		countryCode: "CH",
		lat: 46.2044,
		lng: 6.1432,
	},
	{
		name: "Houston",
		region: "Texas",
		country: "États-Unis",
		countryCode: "US",
		lat: 29.7604,
		lng: -95.3698,
	},
	{
		name: "Istanbul",
		region: "Istanbul",
		country: "Turquie",
		countryCode: "TR",
		lat: 41.0082,
		lng: 28.9784,
	},
	{
		name: "Johannesburg",
		region: "Gauteng",
		country: "Afrique du Sud",
		countryCode: "ZA",
		lat: -26.2041,
		lng: 28.0473,
	},
	{
		name: "Kampala",
		region: "Kampala",
		country: "Ouganda",
		countryCode: "UG",
		lat: 0.3476,
		lng: 32.5825,
	},
	{
		name: "Kigali",
		region: "Kigali",
		country: "Rwanda",
		countryCode: "RW",
		lat: -1.9441,
		lng: 30.0619,
	},
	{
		name: "Kinshasa",
		region: "Kinshasa",
		country: "RD Congo",
		countryCode: "CD",
		lat: -4.4419,
		lng: 15.2663,
	},
	{
		name: "Lagos",
		region: "Lagos",
		country: "Nigeria",
		countryCode: "NG",
		lat: 6.5244,
		lng: 3.3792,
	},
	{
		name: "Libreville",
		region: "Estuaire",
		country: "Gabon",
		countryCode: "GA",
		lat: 0.4162,
		lng: 9.4673,
	},
	{
		name: "Lisbonne",
		region: "Lisbonne",
		country: "Portugal",
		countryCode: "PT",
		lat: 38.7223,
		lng: -9.1393,
	},
	{
		name: "Lomé",
		region: "Maritime",
		country: "Togo",
		countryCode: "TG",
		lat: 6.1319,
		lng: 1.2228,
	},
	{
		name: "Londres",
		region: "Angleterre",
		country: "Royaume-Uni",
		countryCode: "GB",
		lat: 51.5072,
		lng: -0.1276,
	},
	{
		name: "Luanda",
		region: "Luanda",
		country: "Angola",
		countryCode: "AO",
		lat: -8.839,
		lng: 13.2894,
	},
	{
		name: "Lyon",
		region: "Auvergne-Rhône-Alpes",
		country: "France",
		countryCode: "FR",
		lat: 45.764,
		lng: 4.8357,
	},
	{
		name: "Madrid",
		region: "Madrid",
		country: "Espagne",
		countryCode: "ES",
		lat: 40.4168,
		lng: -3.7038,
	},
	{
		name: "Malabo",
		region: "Bioko Norte",
		country: "Guinée équatoriale",
		countryCode: "GQ",
		lat: 3.75,
		lng: 8.7833,
	},
	{
		name: "Marseille",
		region: "Provence-Alpes-Côte d'Azur",
		country: "France",
		countryCode: "FR",
		lat: 43.2965,
		lng: 5.3698,
	},
	{
		name: "Milan",
		region: "Lombardie",
		country: "Italie",
		countryCode: "IT",
		lat: 45.4642,
		lng: 9.19,
	},
	{
		name: "Montréal",
		region: "Québec",
		country: "Canada",
		countryCode: "CA",
		lat: 45.5019,
		lng: -73.5674,
	},
	{
		name: "Nairobi",
		region: "Nairobi",
		country: "Kenya",
		countryCode: "KE",
		lat: -1.2921,
		lng: 36.8219,
	},
	{
		name: "N'Djamena",
		region: "N'Djamena",
		country: "Tchad",
		countryCode: "TD",
		lat: 12.1348,
		lng: 15.0557,
	},
	{
		name: "New York",
		region: "New York",
		country: "États-Unis",
		countryCode: "US",
		lat: 40.7128,
		lng: -74.006,
	},
	{
		name: "Paris",
		region: "Île-de-France",
		country: "France",
		countryCode: "FR",
		lat: 48.8566,
		lng: 2.3522,
	},
	{
		name: "Pointe-Noire",
		region: "Pointe-Noire",
		country: "Congo",
		countryCode: "CG",
		lat: -4.7761,
		lng: 11.8635,
	},
	{
		name: "Rome",
		region: "Latium",
		country: "Italie",
		countryCode: "IT",
		lat: 41.9028,
		lng: 12.4964,
	},
	{
		name: "Toronto",
		region: "Ontario",
		country: "Canada",
		countryCode: "CA",
		lat: 43.6532,
		lng: -79.3832,
	},
	{
		name: "Tunis",
		region: "Tunis",
		country: "Tunisie",
		countryCode: "TN",
		lat: 36.8065,
		lng: 10.1815,
	},
	{
		name: "Washington",
		region: "District of Columbia",
		country: "États-Unis",
		countryCode: "US",
		lat: 38.9072,
		lng: -77.0369,
	},
	{
		name: "Yaoundé",
		region: "Centre",
		country: "Cameroun",
		countryCode: "CM",
		lat: 3.8667,
		lng: 11.5167,
	},
].map((p) => ({ ...p, source: "seed" as const }));

/** Offline-safe suggestions. Cameroon first — it is where the listings are. */
export const SEED_PLACES: Place[] = [
	...CAMEROON_SEED,
	...WORLD_SEED.filter((w) => w.countryCode !== "CM"),
];

// ─── Identity & display ───────────────────────────────────────────────────────

/** Stable identity for dedupe. Two rows for the same city must collapse. */
export function placeKey(
	place: Pick<Place, "name" | "countryCode" | "region">,
) {
	const scope = (place.countryCode || place.region || "").toLowerCase();
	return `${place.name.trim().toLowerCase()}|${scope}`;
}

/**
 * "Douala, Littoral" at home, "Paris, France" abroad — the second component is
 * whichever one actually tells the reader where this is.
 *
 * Pure string composition of user data, so it carries no translatable chrome.
 */
export function formatPlaceLabel(
	place: Pick<Place, "name" | "region" | "country" | "countryCode">,
	options?: { homeCountryCode?: string | null },
): string {
	const name = place.name.trim();
	if (!name) return "";

	const home = options?.homeCountryCode?.toUpperCase() ?? "CM";
	const isHomeCountry =
		!place.countryCode || place.countryCode.toUpperCase() === home;
	const secondary = isHomeCountry
		? place.region || place.country
		: place.country || place.region;

	return secondary && secondary !== name ? `${name}, ${secondary}` : name;
}

// ─── Recently used places ─────────────────────────────────────────────────────

let recentCache: Place[] | null = null;

export async function getRecentPlaces(): Promise<Place[]> {
	if (recentCache) return recentCache;
	try {
		const raw = await AsyncStorage.getItem(RECENT_PLACES_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		recentCache = Array.isArray(parsed)
			? parsed
					.filter((p): p is Place => !!p && typeof p.name === "string")
					.map((p) => ({
						...p,
						region: p.region ?? "",
						source: "recent" as const,
					}))
			: [];
	} catch {
		// Corrupt or unreadable storage must never break a picker.
		recentCache = [];
	}
	return recentCache;
}

/** Call this when the user *confirms* a place, not while they browse. */
export async function rememberPlace(place: Place): Promise<void> {
	if (!place.name?.trim()) return;
	const current = await getRecentPlaces();
	const key = placeKey(place);
	const next = [
		{ ...place, source: "recent" as const },
		...current.filter((p) => placeKey(p) !== key),
	].slice(0, MAX_RECENT_PLACES);
	recentCache = next;
	try {
		await AsyncStorage.setItem(RECENT_PLACES_KEY, JSON.stringify(next));
	} catch {
		// In-memory copy is still correct for this session.
	}
}

export async function clearRecentPlaces(): Promise<void> {
	recentCache = [];
	try {
		await AsyncStorage.removeItem(RECENT_PLACES_KEY);
	} catch {
		// Nothing to recover from.
	}
}

// ─── OS geocoder ──────────────────────────────────────────────────────────────

/**
 * Whether calling the OS geocoder is worth attempting.
 *
 * Android routes both `geocodeAsync` and `reverseGeocodeAsync` through a
 * backend that requires foreground location permission, and on devices without
 * Play Services there may be no backend at all. iOS `CLGeocoder` needs no
 * permission. This check never prompts — it only reads a decision already made.
 */
export async function isGeocoderUsable(): Promise<boolean> {
	if (Platform.OS === "web") return false;
	if (Platform.OS === "ios") return true;
	try {
		const { status } = await Location.getForegroundPermissionsAsync();
		return status === "granted";
	} catch {
		return false;
	}
}

function fromGeocodedAddress(
	address: Location.LocationGeocodedAddress,
	coords?: { lat: number; lng: number },
	source: PlaceSource = "geocoder",
): Place | null {
	const name =
		address.city || address.subregion || address.district || address.region;
	if (!name) return null;
	return {
		name,
		region: address.region && address.region !== name ? address.region : "",
		country: address.country ?? undefined,
		countryCode: address.isoCountryCode?.toUpperCase() ?? undefined,
		lat: coords?.lat,
		lng: coords?.lng,
		source,
	};
}

/**
 * Coordinates → a named place. Resolves to `null` (never throws) when the
 * geocoder is unavailable, offline, or simply has nothing for these coordinates.
 */
export async function resolveCoordsToPlace(
	lat: number,
	lng: number,
	source: PlaceSource = "device",
): Promise<Place | null> {
	if (!(await isGeocoderUsable())) return null;
	try {
		const results = await Location.reverseGeocodeAsync({
			latitude: lat,
			longitude: lng,
		});
		for (const address of results) {
			const place = fromGeocodedAddress(address, { lat, lng }, source);
			if (place) return place;
		}
	} catch {
		// Offline or no geocoding backend — the caller keeps the raw coordinates.
	}
	return null;
}

async function geocoderSuggestions(
	query: string,
	limit: number,
): Promise<Place[]> {
	if (!(await isGeocoderUsable())) return [];
	try {
		const hits = await Location.geocodeAsync(query);
		const out: Place[] = [];
		for (const hit of hits.slice(0, limit)) {
			const place = await resolveCoordsToPlace(
				hit.latitude,
				hit.longitude,
				"geocoder",
			);
			if (place) out.push(place);
		}
		return out;
	} catch {
		return [];
	}
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchPlacesOptions {
	limit?: number;
	/** Consult the OS geocoder for anything the local lists do not cover. */
	useGeocoder?: boolean;
	/** Used only to decide whether to show the region or the country. */
	homeCountryCode?: string | null;
	/** Pinned to the top when it matches, e.g. the user's detected location. */
	pinned?: Place | null;
}

function scoreLocal(place: Place, q: string): number {
	const name = place.name.toLowerCase();
	if (name === q) return 0;
	if (name.startsWith(q)) return 1;
	if (name.includes(q)) return 2;
	if (place.region.toLowerCase().includes(q)) return 3;
	if ((place.country ?? "").toLowerCase().includes(q)) return 4;
	return Number.POSITIVE_INFINITY;
}

/**
 * Suggestions for a free-text city query.
 *
 * Local rows resolve immediately; the geocoder is awaited last and only when it
 * can add something. The caller may always fall back to the raw query string.
 */
export async function searchPlaces(
	query: string,
	options: SearchPlacesOptions = {},
): Promise<Place[]> {
	const limit = options.limit ?? 25;
	const q = query.trim().toLowerCase();
	const recents = await getRecentPlaces();

	const seen = new Set<string>();
	const results: Place[] = [];
	const push = (place: Place) => {
		const key = placeKey(place);
		if (seen.has(key) || results.length >= limit) return;
		seen.add(key);
		results.push(place);
	};

	if (
		options.pinned &&
		(!q || scoreLocal(options.pinned, q) < Number.POSITIVE_INFINITY)
	) {
		push(options.pinned);
	}

	if (!q) {
		for (const place of recents) push(place);
		for (const place of SEED_PLACES) push(place);
		return results;
	}

	const local = [...recents, ...SEED_PLACES]
		.map((place) => ({ place, score: scoreLocal(place, q) }))
		.filter((entry) => entry.score < Number.POSITIVE_INFINITY)
		.sort((a, b) => a.score - b.score);
	for (const entry of local) push(entry.place);

	// Only reach for the network/OS when the local lists are thin and the query
	// is long enough to be a real place name.
	const wantsGeocoder =
		options.useGeocoder !== false && q.length >= 3 && results.length < 5;
	if (wantsGeocoder) {
		for (const place of await geocoderSuggestions(query.trim(), 3)) push(place);
	}

	return results;
}

/**
 * The last-resort place: whatever the user typed. `listing.location` is free
 * text server-side, so this is a first-class value, not a degraded one.
 */
export function customPlace(text: string): Place {
	return { name: text.trim(), region: "", source: "custom" };
}
