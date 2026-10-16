import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import {
	APP_MODE_STORAGE_KEY,
	type AppMode,
	parseStoredMode,
} from "../lib/appMode";
import { useAuth } from "../lib/auth";
import { useMyShops } from "./useMyShops";

/**
 * One store for the whole app, so the account row, both tab layouts and the
 * launch redirect never disagree about the mode.
 */
let state: { mode: AppMode; hydrated: boolean } = {
	mode: "buyer",
	hydrated: false,
};
const listeners = new Set<() => void>();
let hydrating = false;

function emit(next: typeof state) {
	state = next;
	for (const listener of listeners) listener();
}

function hydrate() {
	if (hydrating) return;
	hydrating = true;
	AsyncStorage.getItem(APP_MODE_STORAGE_KEY)
		.then((value) => {
			// A switch made before the read resolved wins over the stored value.
			if (!state.hydrated)
				emit({ mode: parseStoredMode(value), hydrated: true });
		})
		.catch(() => {
			if (!state.hydrated) emit({ ...state, hydrated: true });
		});
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	hydrate();
	return () => listeners.delete(listener);
}

export function setAppMode(mode: AppMode) {
	emit({ mode, hydrated: true });
	AsyncStorage.setItem(APP_MODE_STORAGE_KEY, mode).catch(() => {
		// Best-effort: the switch still holds for this session.
	});
}

export function useStoredAppMode() {
	return useSyncExternalStore(subscribe, () => state);
}

/** Whether the caller belongs to at least one shop — the seller-mode gate. */
export function useHasShopMembership() {
	const { user } = useAuth();
	const myShops = useMyShops();
	return {
		signedIn: Boolean(user),
		loading: Boolean(user) && myShops.isLoading,
		shopCount: myShops.data?.length ?? 0,
		// A failed fetch says nothing about the membership: fall back for now,
		// but keep the stored mode for the next launch.
		known: myShops.data !== undefined,
	};
}
