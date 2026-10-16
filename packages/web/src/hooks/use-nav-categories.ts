"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { DEFAULT_LOCALE, isLocale } from "~/i18n/locales";
import { contentLocaleHeaders } from "~/lib/content-locale";
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
	const current = useLocale();
	const locale = isLocale(current) ? current : DEFAULT_LOCALE;
	const query = useQuery<NavCategory[]>({
		queryKey: [...navCategoriesKey, locale],
		queryFn: async () => {
			const res = await fetch("/api/public/categories?depth=1", {
				headers: contentLocaleHeaders(locale),
			});
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
