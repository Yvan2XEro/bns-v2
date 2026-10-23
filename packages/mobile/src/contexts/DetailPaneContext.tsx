import { createContext, useContext } from "react";

/**
 * True for a screen shown in the detail pane of a list/detail split: its list
 * stays beside it, so there is nothing to go back to and headers drop their
 * back arrow — the same rule as a seller-mode tab's root.
 */
export const DetailPaneContext = createContext(false);

export function useIsDetailPane() {
	return useContext(DetailPaneContext);
}
