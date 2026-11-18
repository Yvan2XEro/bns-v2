import { createContext, useContext } from "react";

/**
 * True for a seller screen shown as a seller-mode tab: there is nothing to go
 * back to, so the shared seller headers drop their back arrow.
 */
export const SellerTabRootContext = createContext(false);

export function useIsSellerTabRoot() {
	return useContext(SellerTabRootContext);
}
