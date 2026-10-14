import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	customPlace,
	formatPlaceLabel,
	type Place,
	placeContext,
	placeKey,
	placePickerView,
	reversePlace,
	searchPlaces,
} from "../../../api/src/contracts/places";

/**
 * Place lookup: Photon for search and reverse geocoding (its URL comes from
 * `GET /api/public/config`, never from a build-time variable), plus the
 * places this device confirmed recently. Naming and ranking live in the
 * shared contract so web and mobile agree on every row.
 */

export type {
	Place,
	PlaceKind,
	PlacePickerSection,
	PlaceSource,
} from "../../../api/src/contracts/places";
export {
	customPlace,
	formatPlaceLabel,
	placeContext,
	placeKey,
	placePickerView,
	reversePlace,
	searchPlaces,
};

const RECENT_PLACES_KEY = "places_recent_v2";
const MAX_RECENT_PLACES = 6;

// ─── Recently used places ────────────────────────────────────────────────────

let recentCache: Place[] | null = null;
const recentListeners = new Set<() => void>();

function isStoredPlace(value: unknown): value is Place {
	return (
		!!value &&
		typeof value === "object" &&
		typeof (value as { name?: unknown }).name === "string"
	);
}

export async function getRecentPlaces(): Promise<Place[]> {
	if (recentCache) return recentCache;
	try {
		const raw = await AsyncStorage.getItem(RECENT_PLACES_KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		recentCache = Array.isArray(parsed)
			? parsed.filter(isStoredPlace).map((place) => ({
					...place,
					region: place.region ?? "",
					source: "recent" as const,
				}))
			: [];
	} catch {
		// Corrupt or unreadable storage must never break a picker.
		recentCache = [];
	}
	return recentCache;
}

const NO_RECENTS: Place[] = [];

/** `useSyncExternalStore` snapshot: empty until storage has been read. */
export function getRecentPlacesSnapshot(): Place[] {
	return recentCache ?? NO_RECENTS;
}

export function subscribeRecentPlaces(listener: () => void): () => void {
	recentListeners.add(listener);
	if (!recentCache) void getRecentPlaces().then(listener);
	return () => {
		recentListeners.delete(listener);
	};
}

/** Call this when the user *confirms* a place, not while they browse. */
export async function rememberPlace(place: Place): Promise<void> {
	if (!place.name.trim()) return;
	const current = await getRecentPlaces();
	const key = placeKey(place);
	recentCache = [
		{ ...place, source: "recent" as const },
		...current.filter((p) => placeKey(p) !== key),
	].slice(0, MAX_RECENT_PLACES);
	for (const listener of recentListeners) listener();
	try {
		await AsyncStorage.setItem(RECENT_PLACES_KEY, JSON.stringify(recentCache));
	} catch {
		// The in-memory copy is still right for this session.
	}
}

export async function clearRecentPlaces(): Promise<void> {
	recentCache = [];
	for (const listener of recentListeners) listener();
	try {
		await AsyncStorage.removeItem(RECENT_PLACES_KEY);
	} catch {
		// Nothing to recover from.
	}
}
