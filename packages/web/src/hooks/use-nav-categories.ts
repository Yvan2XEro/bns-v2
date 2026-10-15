"use client";

import { useQuery } from "@tanstack/react-query";
import { type NavCategory, toNavCategories } from "~/lib/nav";

export const navCategoriesKey = ["categories", "nav"] as const;

/**
 * The category tree behind the menus. Layouts that already fetched it pass it
 * in; anywhere else it is read once, when a menu first needs it.
 */
export function useNavCategories(
	initial: NavCategory[] | undefined,
	enabled = true,
): NavCategory[] {
	const query = useQuery<NavCategory[]>({
		queryKey: navCategoriesKey,
		queryFn: async () => {
			const res = await fetch("/api/public/categories?depth=0");
			if (!res.ok) throw new Error(`categories ${res.status}`);
			const body = (await res.json()) as {
				categories?: Parameters<typeof toNavCategories>[0];
			};
			return toNavCategories(body.categories ?? []);
		},
		initialData: initial,
		enabled,
		staleTime: 10 * 60_000,
	});
	return query.data ?? [];
}
