import {
	foldPlaceText,
	normalizeSettlementName,
	type PopularPlace,
} from "../contracts/places";

type PopularRow = {
	_id: unknown;
	listings: number;
	lat: number | null;
	lng: number | null;
};

type PopularPlacesPayload = {
	db: {
		collections: {
			listings: {
				collection: {
					aggregate(pipeline: Record<string, unknown>[]): {
						toArray(): Promise<PopularRow[]>;
					};
				};
			};
		};
	};
};

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; limit: number; places: PopularPlace[] } | null = null;

/** Test seam. */
export function __resetPopularPlacesCache() {
	cache = null;
}

/**
 * The cities published listings concentrate in, busiest first — what the
 * place picker offers before the user types anything.
 *
 * `listing.location` is free text written by several generations of
 * clients, so "Douala", "Douala II" and "douala, Littoral" are merged into
 * one city here; the spelling with the most listings is the one shown.
 */
export async function findPopularPlaces(
	payload: unknown,
	limit = 8,
): Promise<PopularPlace[]> {
	if (cache && cache.limit === limit && Date.now() - cache.at < CACHE_TTL_MS) {
		return cache.places;
	}
	const rows = await (
		payload as PopularPlacesPayload
	).db.collections.listings.collection
		.aggregate([
			{
				$match: { status: "published", location: { $type: "string", $ne: "" } },
			},
			{
				$group: {
					_id: { $trim: { input: "$location" } },
					listings: { $sum: 1 },
					lat: { $avg: "$coordinates.lat" },
					lng: { $avg: "$coordinates.lng" },
				},
			},
			{ $sort: { listings: -1 } },
			// Headroom for the variants merged below.
			{ $limit: limit * 6 },
		])
		.toArray();

	const merged = new Map<
		string,
		PopularPlace & {
			best: number;
			weight: number;
			latSum: number;
			lngSum: number;
		}
	>();
	for (const row of rows) {
		if (typeof row._id !== "string") continue;
		const name = normalizeSettlementName(row._id.split(",")[0] ?? "");
		if (!name) continue;
		const key = foldPlaceText(name);
		const entry = merged.get(key) ?? {
			name,
			listings: 0,
			lat: null,
			lng: null,
			best: 0,
			weight: 0,
			latSum: 0,
			lngSum: 0,
		};
		if (row.listings > entry.best) {
			entry.best = row.listings;
			entry.name = name;
		}
		entry.listings += row.listings;
		if (typeof row.lat === "number" && typeof row.lng === "number") {
			entry.weight += row.listings;
			entry.latSum += row.lat * row.listings;
			entry.lngSum += row.lng * row.listings;
		}
		merged.set(key, entry);
	}

	const places = [...merged.values()]
		.sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name))
		.slice(0, limit)
		.map(({ name, listings, weight, latSum, lngSum }) => ({
			name,
			listings,
			lat: weight > 0 ? latSum / weight : null,
			lng: weight > 0 ? lngSum / weight : null,
		}));
	cache = { at: Date.now(), limit, places };
	return places;
}
