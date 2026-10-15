import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "../lib/api";
import {
	type CategoryTag,
	categoryTagsPath,
	normalizeCategoryTags,
} from "../lib/categoryTags";

const NO_TAGS: CategoryTag[] = [];

/**
 * The tags a category gets (its own and its ancestors'). `applicableIds` is
 * null until they are known, so a form never prunes or refuses on a guess.
 */
export function useCategoryTags(categoryId: string | null | undefined) {
	const path = categoryTagsPath(categoryId);
	const query = useQuery({
		queryKey: ["tags", categoryId ?? null],
		queryFn: async () => normalizeCategoryTags(await api.get(path ?? "")),
		enabled: path !== null,
		staleTime: 5 * 60 * 1000,
	});
	const tags = path ? (query.data ?? NO_TAGS) : NO_TAGS;
	const loaded = path === null || query.isSuccess;
	const applicableIds = useMemo(
		() => (loaded ? tags.map((tag) => tag.id) : null),
		[loaded, tags],
	);
	return { tags, applicableIds, loaded };
}
