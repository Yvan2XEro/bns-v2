"use client";

import { useQuery } from "@tanstack/react-query";
import type { CategoryCounts } from "../../../api/src/contracts/categoryCounts";

/**
 * Published listings per category in the browsing city, for the menus to
 * put what the city has first. Nothing without a city; the API keeps a
 * city's counts for hours, so this is one request per city per session.
 */
export function useCategoryCounts(city: string | null): CategoryCounts | null {
	const query = useQuery<CategoryCounts>({
		queryKey: ["category-counts", city],
		queryFn: async () => {
			const res = await fetch(
				`/api/public/categories/counts?city=${encodeURIComponent(city ?? "")}`,
			);
			if (!res.ok) throw new Error(`category counts ${res.status}`);
			return (await res.json()) as CategoryCounts;
		},
		enabled: Boolean(city),
		staleTime: 60 * 60_000,
		retry: false,
	});
	return city ? (query.data ?? null) : null;
}
