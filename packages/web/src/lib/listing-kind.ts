import {
	type ListingAction,
	listingAction,
} from "../../../api/src/contracts/listingKinds";

export {
	type DraftAction,
	defaultPriceUnit,
	isDraftAction,
	kindOf,
	kindPriceText,
	type ListingAction,
	type ListingKind,
	listingKindRules,
	type PriceUnit,
	safetyKind,
} from "../../../api/src/contracts/listingKinds";

/** The ad page's main action: order for a shop product, else the kind's own. */
export function adAction(
	listing: { kind?: string | null },
	isShopProduct: boolean,
): ListingAction {
	return listingAction({ kind: listing.kind, isShopProduct });
}
