import {
	displayPriceUnit,
	kindOf,
	type ListingAction,
	type ListingKind,
	listingAction,
	listingKindRules,
} from "../../../api/src/contracts/listingKinds";

export {
	defaultPriceUnit,
	kindOf,
	type ListingAction,
	type ListingKind,
	listingKindRules,
	type PriceUnit,
} from "../../../api/src/contracts/listingKinds";

/** The `ListingKind` messages a helper below needs, however they were loaded. */
type KindT = (key: string) => string;

interface KindFields {
	kind?: string | null;
	priceUnit?: string | null;
}

/**
 * "150 000 / month" (in the market's currency) for a rent, "Salary not stated" for a job without
 * one. `money` is the price already formatted in the market's currency, or
 * null when the ad has none.
 */
export function kindPriceText(
	money: string | null,
	listing: KindFields,
	t: KindT,
): string {
	if (!money)
		return t(`missingPrice.${listingKindRules(listing.kind).missingPrice}`);
	const unit = displayPriceUnit(listing.kind, listing.priceUnit);
	return unit ? `${money} ${t(`unit.${unit}`)}` : money;
}

/** The ad page's main action: order for a shop product, else the kind's own. */
export function adAction(
	listing: KindFields,
	isShopProduct: boolean,
): ListingAction {
	return listingAction({ kind: listing.kind, isShopProduct });
}

/** Actions that open the conversation on a drafted message. */
export const DRAFT_ACTIONS = ["visit", "apply", "quote"] as const;
export type DraftAction = (typeof DRAFT_ACTIONS)[number];

export function isDraftAction(value: unknown): value is DraftAction {
	return (
		typeof value === "string" &&
		(DRAFT_ACTIONS as readonly string[]).includes(value)
	);
}

/** Kinds with safety tips of their own; goods keep the marketplace's. */
export function safetyKind(
	kind: unknown,
): Extract<ListingKind, "rental" | "job" | "service"> | null {
	const resolved = kindOf(kind);
	return resolved === "rental" || resolved === "job" || resolved === "service"
		? resolved
		: null;
}
