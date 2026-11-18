"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { DEFAULT_LOCALE, isLocale } from "~/i18n/locales";
import {
	categoryTagsUrl,
	parseTagItems,
	type TagItem,
} from "~/lib/category-tags";
import { contentLocaleHeaders } from "~/lib/content-locale";

/** Per category and language: a tag's name is translated. */
export const categoryTagsKey = (categoryId: string, locale: string) =>
	["tags", categoryId, locale] as const;

/**
 * The tags a category gets, named in the reader's language. `tags` is null
 * until they are loaded for the category asked about, so a caller never
 * prunes or validates against the previous category's answer; without a
 * category it is an empty list.
 */
export function useCategoryTags(categoryId: string | null | undefined): {
	tags: TagItem[] | null;
} {
	const current = useLocale();
	const locale = isLocale(current) ? current : DEFAULT_LOCALE;
	const url = categoryTagsUrl(categoryId);
	const query = useQuery<TagItem[]>({
		queryKey: categoryTagsKey(categoryId ?? "", locale),
		// No tags rather than an error: a form must not wait forever on them.
		queryFn: async () => {
			try {
				const res = await fetch(url ?? "", {
					headers: contentLocaleHeaders(locale),
				});
				return res.ok ? parseTagItems(await res.json()) : [];
			} catch {
				return [];
			}
		},
		enabled: url !== null,
		staleTime: 5 * 60_000,
	});

	if (!url) return { tags: [] };
	return { tags: query.data ?? null };
}
