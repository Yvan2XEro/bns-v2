import { type Href, router } from "expo-router";
import { createContext, useCallback, useContext } from "react";

/**
 * Set for a screen shown in the detail pane of a list/detail split: its list
 * stays beside it, so there is nothing to go back to — headers drop their
 * back arrow, the same rule as a seller-mode tab's root — and leaving the
 * screen means emptying the pane.
 */
export const DetailPaneContext = createContext<{ close: () => void } | null>(
	null,
);

export function useIsDetailPane() {
	return useContext(DetailPaneContext) !== null;
}

/**
 * How a screen leaves itself (after a save, a "done" button): it empties its
 * pane in a split, and goes back otherwise — to `fallback` without a
 * history (a deep link).
 */
export function useCloseScreen(fallback: Href) {
	const pane = useContext(DetailPaneContext);
	return useCallback(() => {
		if (pane) pane.close();
		else if (router.canGoBack()) router.back();
		else router.replace(fallback);
	}, [pane, fallback]);
}
