import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useSyncExternalStore } from "react";
import {
	parseRecentSearches,
	rememberSearch,
} from "../../../api/src/contracts/searchSuggest";

const STORAGE_KEY = "bns.recentSearches";
const EMPTY: string[] = [];

let cache: string[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
	for (const listener of listeners) listener();
}

function load(): Promise<void> {
	if (cache || loading) return loading ?? Promise.resolve();
	loading = AsyncStorage.getItem(STORAGE_KEY)
		.then((raw) => {
			cache = raw ? parseRecentSearches(JSON.parse(raw)) : EMPTY;
		})
		.catch(() => {
			// Corrupt or unreadable storage is no history, never a broken screen.
			cache = EMPTY;
		})
		.finally(() => {
			loading = null;
			notify();
		});
	return loading;
}

async function write(next: (current: string[]) => string[]): Promise<void> {
	await load();
	cache = next(cache ?? EMPTY);
	notify();
	try {
		await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
	} catch {
		// Storage full: the history lives for this session only.
	}
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	void load();
	return () => listeners.delete(listener);
}

const snapshot = (): string[] => cache ?? EMPTY;

/** The buyer's recent searches on this device, newest first. */
export function useRecentSearches(): {
	recent: string[];
	remember: (query: string) => void;
	remove: (query: string) => void;
	clear: () => void;
} {
	const recent = useSyncExternalStore(subscribe, snapshot, snapshot);
	const remember = useCallback((query: string) => {
		void write((current) => rememberSearch(current, query));
	}, []);
	const remove = useCallback((query: string) => {
		void write((current) => current.filter((entry) => entry !== query));
	}, []);
	const clear = useCallback(() => {
		void write(() => EMPTY);
	}, []);
	return { recent, remember, remove, clear };
}
