"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

type Filters = Record<string, string>;

/** The filters a URL carries, each falling back to its default. */
export function readUrlFilters<T extends Filters>(
	params: Pick<URLSearchParams, "get">,
	defaults: T,
): T {
	const read = { ...defaults };
	for (const key of Object.keys(defaults) as (keyof T & string)[]) {
		const value = params.get(key);
		if (value !== null) read[key] = value as T[typeof key];
	}
	return read;
}

/**
 * The query string for these filters: defaults are left out so a plain view
 * keeps a plain URL, and parameters this list does not own are kept.
 */
export function urlFilterSearch<T extends Filters>(
	current: string,
	filters: T,
	defaults: T,
): string {
	const next = new URLSearchParams(current);
	for (const [key, value] of Object.entries(filters)) {
		if (value === "" || value === defaults[key]) next.delete(key);
		else next.set(key, value);
	}
	return next.toString();
}

/**
 * A list's filters, search, sort and page kept in the URL: coming back from a
 * detail restores them, and a view can be sent to a teammate. Written with
 * `history.replaceState`, so filtering adds no history entry and no server
 * round trip.
 */
export function useUrlFilters<T extends Filters>(defaults: T) {
	const params = useSearchParams();
	const pathname = usePathname();
	const [initial] = useState(() => readUrlFilters(params, defaults));

	const sync = useCallback(
		(filters: T) => {
			const search = urlFilterSearch(window.location.search, filters, defaults);
			const href = search ? `${pathname}?${search}` : pathname;
			if (href !== `${window.location.pathname}${window.location.search}`)
				window.history.replaceState(null, "", href);
		},
		[defaults, pathname],
	);

	return { initial, sync };
}
