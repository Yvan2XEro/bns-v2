"use client";

import { useEffect, useState } from "react";
import {
	categoryTagsUrl,
	parseTagItems,
	type TagItem,
} from "~/lib/category-tags";

/**
 * The tags a category gets. `tags` is null until they are loaded for the
 * category asked about, so a caller never prunes or validates against the
 * previous category's answer; without a category it is an empty list.
 */
export function useCategoryTags(categoryId: string | null | undefined): {
	tags: TagItem[] | null;
} {
	const [state, setState] = useState<{ for: string; tags: TagItem[] } | null>(
		null,
	);
	const url = categoryTagsUrl(categoryId);

	useEffect(() => {
		if (!url) return;
		let cancelled = false;
		fetch(url)
			.then((res) => (res.ok ? res.json() : []))
			.catch(() => [])
			.then((data) => {
				if (!cancelled) setState({ for: url, tags: parseTagItems(data) });
			});
		return () => {
			cancelled = true;
		};
	}, [url]);

	if (!url) return { tags: [] };
	return { tags: state?.for === url ? state.tags : null };
}
