"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
	isDarkTheme,
	parseThemePreference,
	THEME_STORAGE_KEY,
	type ThemePreference,
} from "~/lib/theme";

const listeners = new Set<() => void>();
const DARK_QUERY = "(prefers-color-scheme: dark)";

function read(): ThemePreference {
	try {
		return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
	} catch {
		return "system";
	}
}

function apply(preference: ThemePreference): void {
	const dark = isDarkTheme(preference, window.matchMedia(DARK_QUERY).matches);
	document.documentElement.classList.toggle("dark", dark);
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/**
 * The visitor's theme choice on this device. `system` (the default) follows
 * the phone or computer and changes with it; `ThemeScript` applied the same
 * rule before the first paint.
 */
export function useTheme(): {
	preference: ThemePreference;
	setPreference: (next: ThemePreference) => void;
} {
	const preference = useSyncExternalStore(
		subscribe,
		read,
		(): ThemePreference => "system",
	);

	// While following the system, a system switch (sunset, battery saver)
	// re-themes the open page.
	useEffect(() => {
		if (preference !== "system") return;
		const media = window.matchMedia(DARK_QUERY);
		const onChange = () => apply("system");
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [preference]);

	const setPreference = useCallback((next: ThemePreference) => {
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, next);
		} catch {
			// Storage blocked: the choice holds for this page only.
		}
		apply(next);
		for (const listener of listeners) listener();
	}, []);

	return { preference, setPreference };
}
