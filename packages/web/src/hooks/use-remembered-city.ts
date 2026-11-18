"use client";
import { useSyncExternalStore } from "react";
import {
	getPreferences,
	getServerPreferences,
	subscribePreferences,
} from "~/lib/place-preferences";
import { useAuth } from "./use-auth";

/**
 * The buyer's city for delivery previews: this browser's remembered place,
 * else the profile's home city. Read-only, so it does not take part in the
 * profile mirroring `usePlacePreferences` runs.
 */
export function useRememberedCity(): string | null {
	const prefs = useSyncExternalStore(
		subscribePreferences,
		getPreferences,
		getServerPreferences,
	);
	const { user } = useAuth();
	return prefs.place?.name ?? user?.homeLocation?.city ?? null;
}
