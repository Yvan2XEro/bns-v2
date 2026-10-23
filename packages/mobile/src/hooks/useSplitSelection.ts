import { type Href, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect } from "react";
import { useWindowDimensions } from "react-native";
import {
	openAction,
	SPLIT_PARAM,
	selectionToPush,
} from "@/src/lib/splitNavigation";
import { sizeClassOf } from "@/src/lib/windowLayout";

export { SPLIT_PARAM };

/**
 * Whether the window has room for a list and its detail side by side —
 * decided on the window, never on a pane.
 */
export function useIsSplit(): boolean {
	return sizeClassOf(useWindowDimensions().width) === "expanded";
}

/**
 * The selected item of a list that opens a detail, kept in the route's search
 * params so a deep link, a notification or a rotation lands on it.
 * - Split: `open` selects in place; the list keeps its scroll.
 * - Not split: `open` pushes the detail screen, as on a phone. A selection
 *   left in the URL (the window just narrowed) is pushed the same way.
 */
export function useSplitSelection(
	detailHref: (id: string) => Href,
	/** Params that belong to one item (a draft): dropped when another opens. */
	itemParams: readonly string[] = [],
) {
	const isSplit = useIsSplit();
	const params = useLocalSearchParams<{ [SPLIT_PARAM]?: string }>();
	const selectedId = params[SPLIT_PARAM] || null;

	const open = useCallback(
		(id: string) => {
			const action = openAction(isSplit, id, detailHref, itemParams);
			if (action.kind === "push") router.push(action.href);
			else router.setParams(action.params);
		},
		[isSplit, detailHref, itemParams],
	);

	useEffect(() => {
		const id = selectionToPush(isSplit, selectedId);
		if (!id) return;
		router.setParams({ [SPLIT_PARAM]: undefined });
		router.push(detailHref(id));
	}, [isSplit, selectedId, detailHref]);

	return { isSplit, selectedId: isSplit ? selectedId : null, open };
}
