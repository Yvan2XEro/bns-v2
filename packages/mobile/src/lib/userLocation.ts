import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { api } from "./api";
import {
	formatPlaceLabel,
	type Place,
	rememberPlace,
	resolveCoordsToPlace,
} from "./places";

/**
 * The user's location, remembered.
 *
 * Signed out it lives in AsyncStorage; signed in it is mirrored onto the user's
 * profile (`users.homeLocation`) so a new device starts pre-filled. The two are
 * reconciled by `updatedAt` — last write wins — on the first render after auth
 * settles.
 *
 * PERMISSION RULE, do not break it: nothing in this module prompts unless the
 * caller passes `{ prompt: true }`, and only `detectUserLocation` accepts that
 * flag. Everything else uses `getForegroundPermissionsAsync`, which reads a
 * decision the user has already made and never shows a dialog. An unexplained
 * location dialog on the first screen is a documented App Review rejection.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserLocationSource = "device" | "manual";

export interface UserLocation {
	city: string | null;
	region: string | null;
	country: string | null;
	/** ISO 3166-1 alpha-2, uppercase. */
	countryCode: string | null;
	lat: number | null;
	lng: number | null;
	/** Ready-to-render label, e.g. "Douala, Littoral". Never null, may be "". */
	label: string;
	source: UserLocationSource;
	/** ISO timestamp, used to reconcile device storage against the profile. */
	updatedAt: string;
}

export type LocationPermission =
	| "unknown"
	| "undetermined"
	| "granted"
	| "denied";

/**
 * Why a detection attempt produced nothing. Every one of these is a normal
 * outcome that a screen must render, not an error to throw.
 */
export type LocationFailure =
	| "permission-denied"
	| "services-disabled"
	| "position-unavailable"
	| "geocode-unavailable";

export interface UserLocationState {
	location: UserLocation | null;
	/** True once device storage has been read; screens should wait for it. */
	hydrated: boolean;
	permission: LocationPermission;
	detecting: boolean;
	lastFailure: LocationFailure | null;
}

export interface DetectResult {
	location: UserLocation | null;
	failure: LocationFailure | null;
}

const STORAGE_KEY = "user_location_v1";

/** Silent refresh only kicks in once the stored fix is older than this. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Store ────────────────────────────────────────────────────────────────────
// A module-level external store rather than a React context: every screen that
// needs this (home, create, filters) is a route, so there is no tree to scope
// it to, and this avoids touching the root layout to mount a provider.

let state: UserLocationState = {
	location: null,
	hydrated: false,
	permission: "unknown",
	detecting: false,
	lastFailure: null,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<UserLocationState>) {
	state = { ...state, ...patch };
	for (const listener of listeners) listener();
}

export function getUserLocationState(): UserLocationState {
	return state;
}

export function subscribeUserLocation(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Test seam — resets the in-memory store without touching storage. */
export function __resetUserLocationStore() {
	state = {
		location: null,
		hydrated: false,
		permission: "unknown",
		detecting: false,
		lastFailure: null,
	};
	hydration = null;
	syncedUserId = undefined;
	profileUserId = null;
}

// ─── Conversions ──────────────────────────────────────────────────────────────

export function placeToUserLocation(
	place: Place,
	source: UserLocationSource,
	coords?: { lat: number; lng: number } | null,
): UserLocation {
	return {
		city: place.name || null,
		region: place.region || null,
		country: place.country ?? null,
		countryCode: place.countryCode ?? null,
		lat: coords?.lat ?? place.lat ?? null,
		lng: coords?.lng ?? place.lng ?? null,
		label: formatPlaceLabel(place),
		source,
		updatedAt: new Date().toISOString(),
	};
}

export function userLocationToPlace(location: UserLocation): Place {
	return {
		name: location.city ?? "",
		region: location.region ?? "",
		country: location.country ?? undefined,
		countryCode: location.countryCode ?? undefined,
		lat: location.lat ?? undefined,
		lng: location.lng ?? undefined,
		source: location.source === "device" ? "device" : "custom",
	};
}

function isUserLocation(value: unknown): value is UserLocation {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<UserLocation>;
	return (
		typeof candidate.updatedAt === "string" &&
		(typeof candidate.label === "string" || typeof candidate.city === "string")
	);
}

function normalize(raw: Partial<UserLocation>): UserLocation {
	const place: Place = {
		name: raw.city ?? "",
		region: raw.region ?? "",
		country: raw.country ?? undefined,
		countryCode: raw.countryCode ?? undefined,
		source: "custom",
	};
	return {
		city: raw.city ?? null,
		region: raw.region ?? null,
		country: raw.country ?? null,
		countryCode: raw.countryCode?.toUpperCase() ?? null,
		lat: typeof raw.lat === "number" ? raw.lat : null,
		lng: typeof raw.lng === "number" ? raw.lng : null,
		label: raw.label || formatPlaceLabel(place),
		source: raw.source === "device" ? "device" : "manual",
		updatedAt: raw.updatedAt ?? new Date().toISOString(),
	};
}

/** Coordinates only — no reverse geocode succeeded. Still worth remembering. */
function coordsOnlyLocation(lat: number, lng: number): UserLocation {
	return {
		city: null,
		region: null,
		country: null,
		countryCode: null,
		lat,
		lng,
		label: "",
		source: "device",
		updatedAt: new Date().toISOString(),
	};
}

// ─── Device storage ───────────────────────────────────────────────────────────

async function readStored(): Promise<UserLocation | null> {
	try {
		const raw = await AsyncStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return isUserLocation(parsed) ? normalize(parsed) : null;
	} catch {
		return null;
	}
}

async function writeStored(location: UserLocation | null): Promise<void> {
	try {
		if (location)
			await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(location));
		else await AsyncStorage.removeItem(STORAGE_KEY);
	} catch {
		// A failed write costs a re-detection next launch, nothing more.
	}
}

// ─── Permission (never prompts) ───────────────────────────────────────────────

function toPermission(status: Location.PermissionStatus): LocationPermission {
	if (status === "granted") return "granted";
	if (status === "denied") return "denied";
	return "undetermined";
}

/** Reads the current permission without ever showing a dialog. */
export async function peekLocationPermission(): Promise<LocationPermission> {
	try {
		const { status } = await Location.getForegroundPermissionsAsync();
		const permission = toPermission(status);
		setState({ permission });
		return permission;
	} catch {
		setState({ permission: "unknown" });
		return "unknown";
	}
}

// ─── Hydration ────────────────────────────────────────────────────────────────

let hydration: Promise<void> | null = null;

/**
 * Reads the stored location and the current permission. Idempotent, safe to
 * call from every screen, and guaranteed not to prompt.
 *
 * When permission is already granted and the stored fix is stale, coordinates
 * are refreshed in the background — still without a dialog, because the user
 * has already said yes.
 */
export function hydrateUserLocation(): Promise<void> {
	if (hydration) return hydration;
	hydration = (async () => {
		const [stored, permission] = await Promise.all([
			readStored(),
			peekLocationPermission(),
		]);
		setState({ location: stored, hydrated: true, permission });

		if (permission === "granted") {
			const age = stored?.updatedAt
				? Date.now() - Date.parse(stored.updatedAt)
				: Number.POSITIVE_INFINITY;
			const shouldRefresh =
				stored?.source !== "manual" &&
				(!stored || !Number.isFinite(age) || age > STALE_AFTER_MS);
			if (shouldRefresh) await detectUserLocation({ prompt: false });
		}
	})().catch(() => {
		// Hydration must always complete: a screen blocked on `hydrated` would
		// otherwise render its skeleton forever.
		setState({ hydrated: true });
	});
	return hydration;
}

// ─── Detection ────────────────────────────────────────────────────────────────

export interface DetectOptions {
	/**
	 * Show the OS permission dialog when the decision has not been made yet.
	 * ONLY pass `true` from inside an explicit user action (a press handler).
	 */
	prompt?: boolean;
	accuracy?: Location.LocationAccuracy;
}

/**
 * Reads the device position, names it, persists it, and mirrors it to the
 * profile when signed in.
 *
 * Never throws. Every failure path resolves to `{ location, failure }` so the
 * caller can decide what to render — a denied permission or a dead geocoder
 * must not blank a screen.
 */
export async function detectUserLocation(
	options: DetectOptions = {},
): Promise<DetectResult> {
	const { prompt = false, accuracy = Location.Accuracy.Balanced } = options;

	setState({ detecting: true, lastFailure: null });
	try {
		let permission = await peekLocationPermission();

		if (permission !== "granted") {
			if (!prompt) return fail("permission-denied");
			// The one and only prompt in this module, reached only from a press.
			const { status } = await Location.requestForegroundPermissionsAsync();
			permission = toPermission(status);
			setState({ permission });
			if (permission !== "granted") return fail("permission-denied");
		}

		let position: Location.LocationObject;
		try {
			position = await Location.getCurrentPositionAsync({ accuracy });
		} catch {
			// Thrown when location services are off device-wide, or no fix.
			const enabled = await Location.hasServicesEnabledAsync().catch(
				() => true,
			);
			return fail(enabled ? "position-unavailable" : "services-disabled");
		}

		const lat = position.coords.latitude;
		const lng = position.coords.longitude;

		const place = await resolveCoordsToPlace(lat, lng, "device");
		const location = place
			? placeToUserLocation(place, "device", { lat, lng })
			: coordsOnlyLocation(lat, lng);

		await persist(location);
		return {
			location,
			// Coordinates are usable on their own (nearby listings, distances) but
			// the caller may want to ask for a city by hand.
			failure: place ? null : "geocode-unavailable",
		};
	} catch {
		return fail("position-unavailable");
	} finally {
		setState({ detecting: false });
	}
}

function fail(failure: LocationFailure): DetectResult {
	setState({ lastFailure: failure });
	return { location: state.location, failure };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

async function persist(location: UserLocation | null): Promise<void> {
	setState({ location });
	await writeStored(location);
	await pushToProfile(location);
}

/** The user picked a city by hand. Also feeds the "recent places" list. */
export async function setManualLocation(place: Place): Promise<UserLocation> {
	const location = placeToUserLocation(place, "manual");
	await Promise.all([persist(location), rememberPlace(place)]);
	return location;
}

/** Forgets the location on this device and on the profile. */
export async function clearUserLocation(): Promise<void> {
	await persist(null);
}

// ─── Profile mirror ───────────────────────────────────────────────────────────

/** Shape of `users.homeLocation` as stored by the API. */
export interface ProfileHomeLocation {
	city?: string | null;
	region?: string | null;
	country?: string | null;
	countryCode?: string | null;
	lat?: number | null;
	lng?: number | null;
	source?: string | null;
	updatedAt?: string | null;
}

let profileUserId: string | null = null;
let syncedUserId: string | null | undefined;

/** Coarse enough not to be a home address, precise enough to seed a search. */
function _round(value: number | null): number | null {
	return typeof value === "number" ? Math.round(value * 100) / 100 : null;
}

/**
 * Coordinates are deliberately NOT sent to the profile — only the place name.
 *
 * The privacy policy states that the profile location is "a place name you
 * enter, not GPS coordinates", and that coordinates are sent only with a single
 * search request, with no location history kept. Persisting lat/lng server-side
 * would contradict both, and would change the App Privacy declaration.
 *
 * Coordinates stay device-local (AsyncStorage), which is all "listings near
 * you" needs. The place name is what the other screens pre-fill from.
 */
export function toProfileHomeLocation(
	location: UserLocation,
): ProfileHomeLocation {
	return {
		city: location.city,
		region: location.region,
		country: location.country,
		countryCode: location.countryCode,
		source: location.source,
		updatedAt: location.updatedAt,
	};
}

export function fromProfileHomeLocation(
	raw: ProfileHomeLocation | null | undefined,
): UserLocation | null {
	if (!raw || (!raw.city && typeof raw.lat !== "number")) return null;
	return normalize({
		city: raw.city ?? null,
		region: raw.region ?? null,
		country: raw.country ?? null,
		countryCode: raw.countryCode ?? null,
		lat: typeof raw.lat === "number" ? raw.lat : null,
		lng: typeof raw.lng === "number" ? raw.lng : null,
		source: raw.source === "device" ? "device" : "manual",
		updatedAt: raw.updatedAt ?? undefined,
	});
}

const EMPTY_PROFILE_HOME_LOCATION: ProfileHomeLocation = {
	city: null,
	region: null,
	country: null,
	countryCode: null,
	lat: null,
	lng: null,
	source: null,
	updatedAt: null,
};

async function pushToProfile(location: UserLocation | null): Promise<void> {
	if (!profileUserId) return;
	try {
		await api.patch(`/api/users/${profileUserId}`, {
			homeLocation: location
				? toProfileHomeLocation(location)
				: EMPTY_PROFILE_HOME_LOCATION,
		});
	} catch {
		// Offline, or the token expired, or the field is not deployed yet. The
		// device copy stays authoritative and the next sync carries it up.
	}
}

/**
 * Reconciles the device copy with the signed-in user's profile. Runs at most
 * once per identity; later calls with the same id are no-ops.
 *
 * Conflict rule: last write wins, compared on `updatedAt`.
 *
 * Leaving an account (sign-out or account switch) drops the device copy, so one
 * person's location can never be pushed onto the next person's profile. A guest
 * who has never signed in keeps theirs — that is the whole point of the
 * AsyncStorage copy.
 */
export async function reconcileUserLocationForUser(
	userId: string | null,
	profile: ProfileHomeLocation | null | undefined,
): Promise<void> {
	if (syncedUserId === userId) return;
	const previousUserId = syncedUserId;
	syncedUserId = userId;
	profileUserId = userId;

	await hydrateUserLocation();

	const leftAnAccount =
		previousUserId !== undefined &&
		previousUserId !== null &&
		previousUserId !== userId;
	if (leftAnAccount) {
		setState({ location: null, lastFailure: null });
		await writeStored(null);
	}

	if (!userId) return;

	const remote = fromProfileHomeLocation(profile);
	const local = state.location;

	if (
		remote &&
		(!local || Date.parse(remote.updatedAt) > Date.parse(local.updatedAt))
	) {
		setState({ location: remote });
		await writeStored(remote);
		return;
	}
	if (local) await pushToProfile(local);
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometres. */
export function distanceKm(
	from: { lat: number; lng: number },
	to: { lat: number; lng: number },
): number {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(to.lat - from.lat);
	const dLng = toRad(to.lng - from.lng);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(from.lat)) *
			Math.cos(toRad(to.lat)) *
			Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Distance from the user to a listing, or `null` when either side has no
 * coordinates. Formatting (and its `t()` call) belongs to the caller.
 */
export function distanceToListingKm(listing: {
	coordinates?: { lat?: number | null; lng?: number | null } | null;
}): number | null {
	const me = state.location;
	const lat = listing?.coordinates?.lat;
	const lng = listing?.coordinates?.lng;
	if (typeof me?.lat !== "number" || typeof me?.lng !== "number") return null;
	if (typeof lat !== "number" || typeof lng !== "number") return null;
	return distanceKm({ lat: me.lat, lng: me.lng }, { lat, lng });
}
