/**
 * What each kind of ad allows, and what each kind of business runs. The API,
 * web and mobile all read this table; none of them re-states a rule from it.
 * See docs/listing-kinds-2026-10.md.
 *
 * The kind comes from the category (`categories.listingForm.type`, resolved
 * by lib/listingFormPreset.ts) and is stored on the listing as `kind`.
 */

export const LISTING_KINDS = [
	"product",
	"service",
	"job",
	"rental",
	"generic",
] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

export function isListingKind(value: unknown): value is ListingKind {
	return (
		typeof value === "string" &&
		(LISTING_KINDS as readonly string[]).includes(value)
	);
}

/** What the amount covers. `total` is a one-off price, the default. */
export const PRICE_UNITS = [
	"total",
	"month",
	"week",
	"day",
	"night",
	"hour",
] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export function isPriceUnit(value: unknown): value is PriceUnit {
	return (
		typeof value === "string" &&
		(PRICE_UNITS as readonly string[]).includes(value)
	);
}

/** The ad page's main action for a buyer, besides the phone. */
export type ListingAction = "order" | "contact" | "visit" | "apply" | "quote";

/** How a closed (`sold`) ad is worded. */
export type ListingClosedAs = "sold" | "let" | "filled" | "done";

/** What to show when the ad has no price. */
export type MissingPrice = "onRequest" | "onQuote" | "salaryNotStated";

export interface ListingKindRules {
	/** Main action of a classified; a shop product always offers `order`. */
	action: Exclude<ListingAction, "order">;
	/** Allowed units, the first being the default. */
	priceUnits: readonly PriceUnit[];
	/** Whether the shop catalogue (stock, cart, orders) may hold it. */
	sellable: boolean;
	closedAs: ListingClosedAs;
	missingPrice: MissingPrice;
}

export const LISTING_KIND_RULES: Record<ListingKind, ListingKindRules> = {
	product: {
		action: "contact",
		priceUnits: ["total"],
		sellable: true,
		closedAs: "sold",
		missingPrice: "onRequest",
	},
	rental: {
		// A sale of property is a `rental`-kind ad priced in `total`.
		action: "visit",
		priceUnits: ["month", "week", "day", "night", "total"],
		sellable: false,
		closedAs: "let",
		missingPrice: "onRequest",
	},
	job: {
		action: "apply",
		priceUnits: ["month", "day", "hour"],
		sellable: false,
		closedAs: "filled",
		missingPrice: "salaryNotStated",
	},
	service: {
		action: "quote",
		priceUnits: ["total", "hour", "day", "month"],
		sellable: false,
		closedAs: "done",
		missingPrice: "onQuote",
	},
	generic: {
		action: "contact",
		priceUnits: ["total"],
		sellable: false,
		closedAs: "done",
		missingPrice: "onRequest",
	},
};

/** A stored kind, or `product` for an ad written before kinds were stored. */
export function kindOf(value: unknown): ListingKind {
	return isListingKind(value) ? value : "product";
}

export function listingKindRules(kind: unknown): ListingKindRules {
	return LISTING_KIND_RULES[kindOf(kind)];
}

/** The unit a new ad's form starts on. */
export function defaultPriceUnit(kind: unknown): PriceUnit {
	return listingKindRules(kind).priceUnits[0] ?? "total";
}

/**
 * The unit printed after an ad's price ("/ month"), or null for a one-off
 * price. An ad saved without a unit shows none: an old flat for sale must not
 * suddenly read as a monthly rent.
 */
export function displayPriceUnit(
	kind: unknown,
	unit: unknown,
): Exclude<PriceUnit, "total"> | null {
	if (!isPriceUnit(unit) || unit === "total") return null;
	return listingKindRules(kind).priceUnits.includes(unit) ? unit : null;
}

/**
 * What to store as an ad's unit. No price, or no unit, stores nothing;
 * a unit its kind does not allow is `invalid`.
 */
export function normalizePriceUnit(
	kind: unknown,
	price: unknown,
	unit: unknown,
): { unit: PriceUnit | null; invalid: boolean } {
	if (price === null || price === undefined || price === "")
		return { unit: null, invalid: false };
	if (unit === null || unit === undefined || unit === "")
		return { unit: null, invalid: false };
	if (isPriceUnit(unit) && listingKindRules(kind).priceUnits.includes(unit))
		return { unit, invalid: false };
	return { unit: null, invalid: true };
}

/** The main action on the ad page. */
export function listingAction(input: {
	kind: unknown;
	isShopProduct: boolean;
}): ListingAction {
	return input.isShopProduct ? "order" : listingKindRules(input.kind).action;
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

/**
 * "150 000 / month" for a rent, "Salary not stated" for a job without one.
 * `money` is the price already formatted in the market's currency, or null.
 * `t` resolves the clients' kind messages: `unit.<unit>` and
 * `missingPrice.<case>`, from web's `ListingKind` or mobile's `listingKind`.
 */
export function kindPriceText(
	money: string | null,
	listing: { kind?: unknown; priceUnit?: unknown },
	t: (key: string) => string,
): string {
	if (!money)
		return t(`missingPrice.${listingKindRules(listing.kind).missingPrice}`);
	const unit = displayPriceUnit(listing.kind, listing.priceUnit);
	return unit ? `${money} ${t(`unit.${unit}`)}` : money;
}

// ── Shop profiles ────────────────────────────────────────────────────────────

export const SHOP_PROFILES = [
	"store",
	"agency",
	"employer",
	"provider",
] as const;
export type ShopProfile = (typeof SHOP_PROFILES)[number];

export function isShopProfile(value: unknown): value is ShopProfile {
	return (
		typeof value === "string" &&
		(SHOP_PROFILES as readonly string[]).includes(value)
	);
}

export interface ShopProfileRules {
	/** Catalogue, stock, orders, returns, disputes, delivery, resale. */
	retail: boolean;
	/** The kind its ads usually are: what its public page counts them as. */
	kind: ListingKind;
}

export const SHOP_PROFILE_RULES: Record<ShopProfile, ShopProfileRules> = {
	store: { retail: true, kind: "product" },
	agency: { retail: false, kind: "rental" },
	employer: { retail: false, kind: "job" },
	provider: { retail: false, kind: "service" },
};

/** A stored profile, or `store` for a shop created before profiles. */
export function profileOf(value: unknown): ShopProfile {
	return isShopProfile(value) ? value : "store";
}

export function shopProfileRules(profile: unknown): ShopProfileRules {
	return SHOP_PROFILE_RULES[profileOf(profile)];
}
