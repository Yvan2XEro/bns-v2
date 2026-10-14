import { type Place, placeKey } from "../../../api/src/contracts/places";
import type { User } from "../../../api/src/payload-types";

/**
 * The places this browser remembers.
 *
 * `place` is "where I am": it pre-fills a new listing or shop and biases
 * place search. `browseAll` scopes the home search to every city or to
 * `place` — a visitor browses everything until they pick a city, and "All
 * cities" never forgets theirs. Signed in, `place` is mirrored onto the
 * profile's `homeLocation` (shared with the mobile app), last write wins.
 *
 * Coordinates never leave the browser: the privacy policy promises the
 * profile holds a place name, not a position.
 */
export interface PlacePreferences {
	place: Place | null;
	/** ISO timestamp of the last change to `place`, for the profile mirror. */
	placeUpdatedAt: string | null;
	browseAll: boolean;
	recents: Place[];
}

export type HomeLocation = NonNullable<User["homeLocation"]>;

export const EMPTY_PREFERENCES: PlacePreferences = {
	place: null,
	placeUpdatedAt: null,
	browseAll: true,
	recents: [],
};

const STORAGE_KEY = "bns.places.v1";
const MAX_RECENTS = 6;

function isPlace(value: unknown): value is Place {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.name === "string" &&
		candidate.name.trim() !== "" &&
		typeof candidate.region === "string"
	);
}

/** Never throws: anything unreadable is "nothing remembered". */
export function parsePreferences(raw: string | null): PlacePreferences {
	if (!raw) return EMPTY_PREFERENCES;
	try {
		const value: unknown = JSON.parse(raw);
		if (!value || typeof value !== "object") return EMPTY_PREFERENCES;
		const v = value as Record<string, unknown>;
		const place = isPlace(v.place) ? v.place : null;
		return {
			place,
			placeUpdatedAt:
				place && typeof v.placeUpdatedAt === "string" ? v.placeUpdatedAt : null,
			browseAll: v.browseAll !== false || !place,
			recents: Array.isArray(v.recents)
				? v.recents.filter(isPlace).slice(0, MAX_RECENTS)
				: [],
		};
	} catch {
		return EMPTY_PREFERENCES;
	}
}

export function withRecent(recents: Place[], place: Place): Place[] {
	const key = placeKey(place);
	return [
		{ ...place, source: "recent" as const },
		...recents.filter((p) => placeKey(p) !== key),
	].slice(0, MAX_RECENTS);
}

export function placeFromHomeLocation(
	home: User["homeLocation"] | null | undefined,
): Place | null {
	if (!home?.city) return null;
	return {
		name: home.city,
		region: home.region ?? "",
		...(home.country ? { country: home.country } : {}),
		...(home.countryCode ? { countryCode: home.countryCode } : {}),
		source: "saved",
	};
}

export function homeLocationFromPlace(
	place: Place | null,
	updatedAt: string,
): HomeLocation {
	return {
		city: place?.name ?? null,
		region: place?.region || null,
		country: place?.country ?? null,
		countryCode: place?.countryCode ?? null,
		source: place ? (place.source === "device" ? "device" : "manual") : null,
		updatedAt: place ? updatedAt : null,
	};
}

/**
 * Which copy wins when a user signs in: the profile when it was written
 * later (or this browser has nothing), this browser's when it is newer.
 */
export function reconcileWithProfile(
	local: Pick<PlacePreferences, "place" | "placeUpdatedAt">,
	home: User["homeLocation"] | null | undefined,
): "adopt" | "push" | "none" {
	const remote = placeFromHomeLocation(home);
	const remoteAt = Date.parse(home?.updatedAt ?? "") || 0;
	const localAt = Date.parse(local.placeUpdatedAt ?? "") || 0;
	if (remote && (!local.place || remoteAt > localAt)) {
		return local.place && placeKey(local.place) === placeKey(remote)
			? "none"
			: "adopt";
	}
	if (local.place && localAt > remoteAt) return "push";
	return "none";
}

// ─── Store ───────────────────────────────────────────────────────────────────

let snapshot: PlacePreferences | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage;
	} catch {
		return null;
	}
}

export function getPreferences(): PlacePreferences {
	snapshot ??= parsePreferences(storage()?.getItem(STORAGE_KEY) ?? null);
	return snapshot;
}

export function getServerPreferences(): PlacePreferences {
	return EMPTY_PREFERENCES;
}

export function subscribePreferences(listener: () => void): () => void {
	listeners.add(listener);
	// Another tab picked a place: re-read it here too.
	const onStorage = (event: StorageEvent) => {
		if (event.key !== STORAGE_KEY) return;
		snapshot = null;
		listener();
	};
	window.addEventListener("storage", onStorage);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", onStorage);
	};
}

export function updatePreferences(
	patch: (current: PlacePreferences) => Partial<PlacePreferences>,
): PlacePreferences {
	const next = { ...getPreferences(), ...patch(getPreferences()) };
	snapshot = next;
	try {
		storage()?.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Private mode or a full quota: the in-memory copy still holds.
	}
	for (const listener of listeners) listener();
	return next;
}
