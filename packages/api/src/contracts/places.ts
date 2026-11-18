import { z } from "zod";

/**
 * Place lookup shared by web and mobile.
 *
 * Both clients query the Photon geocoder (komoot/photon) directly, at the URL
 * `GET /api/public/config` hands them as `photonUrl`; this module owns
 * everything between the raw Photon answer and a row the picker can render,
 * so the two clients rank and name places identically.
 *
 * What a listing or a shop stores is the settlement: `Place.name` is always a
 * city, town or village ("Douala"), never an arrondissement ("Douala II") or a
 * neighbourhood. A neighbourhood the user picked is kept beside it in
 * `district`, with its own coordinates, so "near me" stays precise while the
 * searchable `location` stays one value per city.
 */

export type PlaceKind = "city" | "town" | "village" | "district";

export type PlaceSource =
	| "search"
	| "recent"
	| "popular"
	| "device"
	| "custom"
	| "saved";

export interface Place {
	/** City, town or village — the value stored in `listing.location`. */
	name: string;
	/** Neighbourhood inside `name`, when the user picked one. */
	district?: string;
	/** Administrative region, "" when unknown ("Littoral", not "Région du Littoral"). */
	region: string;
	country?: string;
	/** ISO 3166-1 alpha-2, uppercase. */
	countryCode?: string;
	lat?: number;
	lng?: number;
	kind?: PlaceKind;
	source: PlaceSource;
}

/** A city the platform's own published listings concentrate in. */
export interface PopularPlace {
	name: string;
	listings: number;
	lat: number | null;
	lng: number | null;
}

export interface PopularPlacesResponse {
	places: PopularPlace[];
}

export function popularPlacesRequest() {
	return {
		queryKey: ["places", "popular"] as const,
		path: "/api/public/places/popular",
	};
}

export function popularToPlace(popular: PopularPlace): Place {
	return {
		name: popular.name,
		region: "",
		...(popular.lat !== null && popular.lng !== null
			? { lat: popular.lat, lng: popular.lng }
			: {}),
		kind: "city",
		source: "popular",
	};
}

// ─── Photon requests ─────────────────────────────────────────────────────────

/** The launch market: results are biased towards it, never restricted to it. */
export const DEFAULT_PLACE_BIAS = { lat: 5.69, lng: 12.74 } as const;
export const DEFAULT_COUNTRY_CODE = "CM";

export const PLACE_QUERY_MIN_LENGTH = 2;

export interface PlaceSearchOptions {
	lang?: string;
	limit?: number;
	/** The user's own position when known; the launch market otherwise. */
	bias?: { lat: number; lng: number } | null;
}

function photonBase(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, "");
}

function photonLang(lang: string | undefined): string {
	// Photon indexes default, de, en, fr and it; anything else reads the
	// default (local) names, which is the right answer for Cameroon anyway.
	const short = (lang ?? "fr").slice(0, 2).toLowerCase();
	return ["de", "en", "fr", "it"].includes(short) ? short : "default";
}

export function photonSearchUrl(
	baseUrl: string,
	query: string,
	options: PlaceSearchOptions = {},
): string {
	const bias = options.bias ?? DEFAULT_PLACE_BIAS;
	const params = new URLSearchParams({
		q: query.trim(),
		// Over-fetch: ranking and de-duplication below drop a good share.
		limit: String(options.limit ?? 15),
		lang: photonLang(options.lang),
		// Settlements and neighbourhoods only: administrative boundaries
		// ("Douala V") duplicate the city they belong to.
		osm_tag: "place",
		lat: String(bias.lat),
		lon: String(bias.lng),
		zoom: options.bias ? "10" : "6",
		location_bias_scale: "0.4",
	});
	return `${photonBase(baseUrl)}/api?${params.toString()}`;
}

export function photonReverseUrl(
	baseUrl: string,
	coords: { lat: number; lng: number },
	options: { lang?: string } = {},
): string {
	const params = new URLSearchParams({
		lat: String(coords.lat),
		lon: String(coords.lng),
		lang: photonLang(options.lang),
		osm_tag: "place",
		limit: "5",
		radius: "15",
	});
	return `${photonBase(baseUrl)}/reverse?${params.toString()}`;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

const photonFeatureSchema = z.object({
	properties: z.object({
		osm_key: z.string().optional(),
		osm_value: z.string().optional(),
		name: z.string().optional(),
		district: z.string().optional(),
		city: z.string().optional(),
		county: z.string().optional(),
		state: z.string().optional(),
		country: z.string().optional(),
		countrycode: z.string().optional(),
	}),
	geometry: z
		.object({ coordinates: z.tuple([z.number(), z.number()]) })
		.optional(),
});

const photonResponseSchema = z.object({
	features: z.array(z.unknown()),
});

type PhotonFeature = z.infer<typeof photonFeatureSchema>;

const SETTLEMENT_KINDS: Record<string, PlaceKind> = {
	city: "city",
	town: "town",
	village: "village",
	hamlet: "village",
};

const NEIGHBOURHOOD_VALUES = new Set([
	"suburb",
	"quarter",
	"neighbourhood",
	"borough",
	"locality",
	"city_block",
]);

/**
 * "Douala II" → "Douala", "Yaoundé 3e" → "Yaoundé". Cameroon's cities are
 * split into numbered arrondissements and OSM files neighbourhoods under them;
 * the listing belongs to the city.
 */
export function normalizeSettlementName(name: string): string {
	return name
		.trim()
		.replace(/\s+(?:[IVX]{1,4}|\d{1,2})(?:er|e|ème)?$/u, "")
		.trim();
}

/** "Région du Littoral" → "Littoral". */
export function normalizeRegionName(region: string | undefined): string {
	if (!region) return "";
	return region
		.trim()
		.replace(/^r[ée]gion\s+(?:du|de la|de l['’]|des|de)\s*/iu, "")
		.trim();
}

function featureToPlace(feature: PhotonFeature): Place | null {
	const p = feature.properties;
	if (p.osm_key !== "place" || !p.name || !p.osm_value) return null;
	const coords = feature.geometry?.coordinates;
	const common = {
		region: normalizeRegionName(p.state),
		...(p.country ? { country: p.country } : {}),
		...(p.countrycode ? { countryCode: p.countrycode.toUpperCase() } : {}),
		...(coords ? { lat: coords[1], lng: coords[0] } : {}),
		source: "search" as const,
	};

	const settlement = SETTLEMENT_KINDS[p.osm_value];
	if (settlement) {
		return {
			name: normalizeSettlementName(p.name),
			kind: settlement,
			...common,
		};
	}
	if (NEIGHBOURHOOD_VALUES.has(p.osm_value)) {
		// A neighbourhood is only useful with the city it belongs to.
		const city = p.city ?? p.county;
		if (!city) return null;
		const name = normalizeSettlementName(city);
		// A locality is often a crossroads ("Carrefour Tiff"); its district is
		// the neighbourhood people actually name.
		const district =
			p.osm_value === "locality" ? (p.district ?? p.name) : p.name;
		if (district === name) return { name, kind: "city", ...common };
		return { name, district, kind: "district", ...common };
	}
	return null;
}

/** Never throws: a malformed or unexpected answer reads as "no places". */
export function parsePhotonResponse(json: unknown): Place[] {
	const parsed = photonResponseSchema.safeParse(json);
	if (!parsed.success) return [];
	const places: Place[] = [];
	for (const raw of parsed.data.features) {
		const feature = photonFeatureSchema.safeParse(raw);
		if (!feature.success) continue;
		const place = featureToPlace(feature.data);
		if (place) places.push(place);
	}
	return places;
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

export function foldPlaceText(text: string): string {
	return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Stable identity for de-duplication: the same place must collapse to one row. */
export function placeKey(
	place: Pick<Place, "name" | "district" | "region" | "countryCode">,
): string {
	return [
		foldPlaceText(place.name),
		foldPlaceText(place.district ?? ""),
		foldPlaceText(place.region),
		(place.countryCode ?? "").toUpperCase(),
	].join("|");
}

function textScore(candidate: string, query: string): number {
	const text = foldPlaceText(candidate);
	if (!text) return 4;
	if (text === query) return 0;
	if (text.startsWith(query)) return 1;
	if (text.split(/[\s'’-]+/).some((word) => word.startsWith(query))) return 2;
	if (text.includes(query)) return 3;
	return 4;
}

const KIND_RANK: Record<PlaceKind, number> = {
	city: 0,
	town: 1,
	district: 2,
	village: 3,
};

/**
 * Photon ranks a village named exactly like the query above the city the
 * query is the start of ("Yaou" before "Yaoundé"). People looking for a
 * place to buy or sell mean the city, so size outweighs an exact spelling,
 * and the home market outweighs both.
 */
export function rankPlaces(
	places: Place[],
	query: string,
	options: { countryCode?: string | null } = {},
): Place[] {
	const q = foldPlaceText(query);
	const home = (options.countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase();
	const scored = places.map((place, index) => {
		const text = Math.min(
			textScore(place.name, q),
			place.district ? textScore(place.district, q) : 4,
		);
		const kind = KIND_RANK[place.kind ?? "village"];
		const foreign = place.countryCode && place.countryCode !== home ? 6 : 0;
		return { place, index, text, score: text * 2 + kind * 3 + foreign };
	});
	// Photon matches fuzzily; a row sharing nothing with the query is only
	// worth showing when nothing else came back (a typo).
	const matching = scored.filter((entry) => entry.text < 4);
	const kept = matching.length > 0 ? matching : scored;
	kept.sort((a, b) => a.score - b.score || a.index - b.index);
	return dedupePlaces(kept.map((entry) => entry.place));
}

export function dedupePlaces(places: Place[]): Place[] {
	const seen = new Set<string>();
	return places.filter((place) => {
		const key = placeKey(place);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

// ─── Display ─────────────────────────────────────────────────────────────────

/**
 * "Akwa, Douala" for a neighbourhood, "Douala, Littoral" at home, "Lagos,
 * Nigeria" abroad — the second part is whichever one tells the reader where
 * this is. Pure composition of place names, so it carries no UI copy.
 */
export function formatPlaceLabel(
	place: Pick<
		Place,
		"name" | "district" | "region" | "country" | "countryCode"
	>,
	options: { homeCountryCode?: string | null } = {},
): string {
	const name = place.name.trim();
	if (!name) return "";
	if (place.district) return `${place.district}, ${name}`;
	const home = (options.homeCountryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase();
	const isHome = !place.countryCode || place.countryCode.toUpperCase() === home;
	const secondary = isHome
		? place.region || place.country
		: place.country || place.region;
	return secondary && secondary !== name ? `${name}, ${secondary}` : name;
}

/** The secondary line of a picker row: where the place is. */
export function placeContext(
	place: Pick<
		Place,
		"name" | "district" | "region" | "country" | "countryCode"
	>,
	options: { homeCountryCode?: string | null } = {},
): string {
	const home = (options.homeCountryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase();
	const isHome = !place.countryCode || place.countryCode.toUpperCase() === home;
	const parts = place.district
		? [place.name, place.region]
		: [place.region, isHome ? undefined : place.country];
	return parts.filter((part): part is string => Boolean(part)).join(", ");
}

/** What the user typed, kept as-is: `listing.location` is free text. */
export function customPlace(text: string): Place {
	return { name: text.trim(), region: "", source: "custom" };
}

export function placeCoords(
	place: Pick<Place, "lat" | "lng"> | null | undefined,
): { lat: number; lng: number } | null {
	return typeof place?.lat === "number" && typeof place?.lng === "number"
		? { lat: place.lat, lng: place.lng }
		: null;
}

// ─── Fetching ────────────────────────────────────────────────────────────────
// Global `fetch` only, so the same calls run in the browser and in React
// Native.

export async function searchPlaces(
	photonUrl: string,
	query: string,
	options: PlaceSearchOptions & { signal?: AbortSignal } = {},
): Promise<Place[]> {
	const response = await fetch(photonSearchUrl(photonUrl, query, options), {
		signal: options.signal,
	});
	if (!response.ok) throw new Error(`photon ${response.status}`);
	return rankPlaces(parsePhotonResponse(await response.json()), query).slice(
		0,
		8,
	);
}

/**
 * Coordinates → the neighbourhood or city they fall in. Resolves to `null`
 * (never throws) offline or when Photon has nothing there: the caller keeps
 * the raw coordinates.
 */
export async function reversePlace(
	photonUrl: string | null,
	coords: { lat: number; lng: number },
	lang?: string,
): Promise<Place | null> {
	if (!photonUrl) return null;
	try {
		const response = await fetch(photonReverseUrl(photonUrl, coords, { lang }));
		if (!response.ok) return null;
		const [place] = parsePhotonResponse(await response.json());
		return place ? { ...place, ...coords, source: "device" } : null;
	} catch {
		return null;
	}
}

// ─── Picker view ─────────────────────────────────────────────────────────────

export interface PlacePickerSection<P extends Place = Place> {
	key: "results" | "recent" | "popular";
	places: P[];
}

export interface PlacePickerView<P extends Place = Place> {
	sections: PlacePickerSection<P>[];
	/** The typed text, offered as-is when no row spells it exactly. */
	typed: string | null;
}

function placeMatches(place: Place, folded: string): boolean {
	return [place.name, place.district ?? ""].some((text) =>
		foldPlaceText(text).includes(folded),
	);
}

/**
 * What a place picker lists. Before typing: recent places, then the
 * platform's popular cities not already among them. While typing: recent
 * places that match first (one tap to pick again), then Photon's results.
 */
export function placePickerView<P extends Place>(input: {
	query: string;
	results: P[];
	recents: P[];
	popular: P[];
}): PlacePickerView<P> {
	const query = input.query.trim();
	const folded = foldPlaceText(query);

	if (folded.length < PLACE_QUERY_MIN_LENGTH) {
		const recent = input.recents.slice(0, 5);
		const recentCities = new Set(recent.map((p) => foldPlaceText(p.name)));
		const popular = input.popular.filter(
			(p) => !recentCities.has(foldPlaceText(p.name)),
		);
		const sections: PlacePickerSection<P>[] = [
			{ key: "recent", places: recent },
			{ key: "popular", places: popular },
		];
		return {
			sections: sections.filter((section) => section.places.length > 0),
			typed: null,
		};
	}

	const recent = input.recents.filter((p) => placeMatches(p, folded));
	const seen = new Set(recent.map(placeKey));
	const results = input.results.filter((p) => !seen.has(placeKey(p)));
	const exact = [...recent, ...results].some(
		(p) => foldPlaceText(p.district ?? p.name) === folded,
	);
	const sections: PlacePickerSection<P>[] = [
		{ key: "recent", places: recent },
		{ key: "results", places: results },
	];
	return {
		sections: sections.filter((section) => section.places.length > 0),
		typed: exact ? null : query,
	};
}
