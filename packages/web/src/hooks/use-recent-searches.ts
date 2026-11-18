"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
	parseRecentSearches,
	rememberSearch,
} from "../../../api/src/contracts/searchSuggest";

const STORAGE_KEY = "bns.recentSearches";
const EMPTY: string[] = [];

let snapshot: string[] | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage;
	} catch {
		return null;
	}
}

function read(): string[] {
	if (snapshot) return snapshot;
	try {
		const raw = storage()?.getItem(STORAGE_KEY);
		snapshot = raw ? parseRecentSearches(JSON.parse(raw)) : EMPTY;
	} catch {
		snapshot = EMPTY;
	}
	return snapshot;
}

function write(next: string[]): void {
	snapshot = next;
	try {
		storage()?.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Private window or storage full: the history lives for this page only.
	}
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/**
 * The buyer's recent searches on this device, shared by every search box on
 * the page (header, home hero) so one remembers what the other ran.
 */
export function useRecentSearches(): {
	recent: string[];
	remember: (query: string) => void;
	remove: (query: string) => void;
	clear: () => void;
} {
	const recent = useSyncExternalStore(subscribe, read, () => EMPTY);
	const remember = useCallback(
		(query: string) => write(rememberSearch(read(), query)),
		[],
	);
	const remove = useCallback(
		(query: string) => write(read().filter((entry) => entry !== query)),
		[],
	);
	const clear = useCallback(() => write(EMPTY), []);
	return { recent, remember, remove, clear };
}
