import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api";
import type { CategoryCounts } from "../../../api/src/contracts/categoryCounts";

/**
 * Published listings per category in the browsing city, for the home and
 * the categories screen to put what the city has first. Nothing without a
 * city; the API keeps a city's counts for hours.
 */
export function useCategoryCounts(city: string | null): CategoryCounts | null {
	const query = useQuery({
		queryKey: ["category-counts", city],
		queryFn: () =>
			api.get<CategoryCounts>(
				`/api/public/categories/counts?city=${encodeURIComponent(city ?? "")}`,
			),
		enabled: Boolean(city),
		staleTime: 60 * 60_000,
		retry: false,
	});
	return city ? (query.data ?? null) : null;
}
