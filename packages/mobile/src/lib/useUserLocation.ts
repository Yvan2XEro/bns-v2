import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "./auth";
import type { Place } from "./places";
import {
	clearUserLocation,
	type DetectResult,
	detectUserLocation,
	getUserLocationState,
	hydrateUserLocation,
	type LocationPermission,
	type ProfileHomeLocation,
	reconcileUserLocationForUser,
	setManualLocation,
	subscribeUserLocation,
	type UserLocation,
	userLocationToPlace,
} from "./userLocation";

/**
 * React binding for the remembered user location.
 *
 * No provider to mount: the store lives at module scope, so every screen sees
 * the same value and the root layout is untouched. The hook only adds three
 * things — subscription, one-shot hydration, and the profile reconciliation
 * that needs `useAuth()`.
 */

/** `UserDoc` does not know about `homeLocation` yet; read it structurally. */
type UserWithHomeLocation = {
	id: string;
	homeLocation?: ProfileHomeLocation | null;
};

export interface UseUserLocation {
	/** `null` until something is known. Check `hydrated` before deciding. */
	location: UserLocation | null;
	/** False until device storage has been read. Screens should not act before. */
	hydrated: boolean;
	permission: LocationPermission;
	detecting: boolean;
	/** Coordinates, when available — for "near me" queries and distances. */
	coords: { lat: number; lng: number } | null;
	/** Display label, e.g. "Douala, Littoral". Empty when nothing is known. */
	label: string;
	/** True when the app may ask for permission, i.e. it has not been refused. */
	canPrompt: boolean;
	/**
	 * Detect and remember the device position. Pass no argument only from a
	 * press handler: it is allowed to show the OS permission dialog.
	 */
	requestDetection: () => Promise<DetectResult>;
	/** Re-read the position without ever prompting. */
	refreshSilently: () => Promise<DetectResult>;
	/** Record a place the user chose by hand (city picker, profile form). */
	selectPlace: (place: Place) => Promise<UserLocation>;
	/** The remembered location as a `Place`, to seed a picker. */
	asPlace: Place | null;
	clear: () => Promise<void>;
}

export function useUserLocation(): UseUserLocation {
	const state = useSyncExternalStore(
		subscribeUserLocation,
		getUserLocationState,
	);
	const { user } = useAuth();

	// Reads storage and the already-granted permission. Never prompts.
	useEffect(() => {
		void hydrateUserLocation();
	}, []);

	useEffect(() => {
		const account = user as UserWithHomeLocation | null;
		void reconcileUserLocationForUser(
			account?.id ?? null,
			account?.homeLocation,
		);
	}, [user]);

	const requestDetection = useCallback(
		() => detectUserLocation({ prompt: true }),
		[],
	);
	const refreshSilently = useCallback(
		() => detectUserLocation({ prompt: false }),
		[],
	);
	const selectPlace = useCallback(
		(place: Place) => setManualLocation(place),
		[],
	);
	const clear = useCallback(() => clearUserLocation(), []);

	const coords = useMemo(() => {
		const { lat, lng } = state.location ?? {};
		return typeof lat === "number" && typeof lng === "number"
			? { lat, lng }
			: null;
	}, [state.location]);

	const asPlace = useMemo(
		() => (state.location?.city ? userLocationToPlace(state.location) : null),
		[state.location],
	);

	return {
		location: state.location,
		hydrated: state.hydrated,
		permission: state.permission,
		detecting: state.detecting,
		coords,
		label: state.location?.label ?? "",
		canPrompt: state.permission !== "denied",
		requestDetection,
		refreshSilently,
		selectPlace,
		asPlace,
		clear,
	};
}
