"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
	parseSelection,
	type QueueSelection,
	selectionParam,
} from "~/lib/moderation-console";

/**
 * The item open in a master-detail view, read from and written to `?item=type:id`
 * so a selection is a shareable link. Other parameters (filters) are kept.
 * Opening pushes a history entry, so the browser's back closes the panel.
 */
export function useUrlSelection() {
	const params = useSearchParams();
	const pathname = usePathname();
	const router = useRouter();
	const selection = parseSelection(params.get("item"));

	const hrefFor = useCallback(
		(item: QueueSelection | null) => {
			const next = new URLSearchParams(params.toString());
			if (item) next.set("item", selectionParam(item));
			else next.delete("item");
			const search = next.toString();
			return search ? `${pathname}?${search}` : pathname;
		},
		[params, pathname],
	);

	const select = useCallback(
		(item: QueueSelection | null) => {
			const href = hrefFor(item);
			if (item) router.push(href, { scroll: false });
			else router.replace(href, { scroll: false });
		},
		[hrefFor, router],
	);

	return { selection, select, hrefFor };
}
