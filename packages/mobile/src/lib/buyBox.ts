import { ERROR_CODES } from "./apiError";

export interface BuyBoxInput {
	ordersEnabled: boolean;
	/** The API's derived `listings.orderable` — the one implementation of the rule. */
	orderable: boolean | null | undefined;
	shop: { id: string; restricted: boolean } | null;
	/** The viewer belongs to the listing's shop; the cart refuses them with `checkout.selfPurchase`. */
	ownShop: boolean;
	/** `productSummary.available`: at least one variant can be bought. */
	productAvailable: boolean | null;
	signedIn: boolean;
}

export type BuyBoxHiddenReason =
	| "ordersDisabled"
	| "noShop"
	| "ownShop"
	| "notOrderable"
	| "soldOut";

export type BuyBoxDecision =
	| { kind: "hidden"; reason: BuyBoxHiddenReason }
	| { kind: "restricted" }
	| { kind: "buy"; signedIn: boolean };

/**
 * Whether the listing screen shows the buy box — the twin of web's
 * `decideBuyBox`, compared case by case in the API's parity specs. It does
 * not re-decide what `orderable` already decided; it adds only what the
 * screen knows (the client flag, who is looking). Anything but `buy` leaves
 * the screen as it was before ordering existed.
 */
export function decideBuyBox(input: BuyBoxInput): BuyBoxDecision {
	if (!input.ordersEnabled) return { kind: "hidden", reason: "ordersDisabled" };
	if (!input.shop) return { kind: "hidden", reason: "noShop" };
	if (input.ownShop) return { kind: "hidden", reason: "ownShop" };
	if (input.shop.restricted) return { kind: "restricted" };
	if (input.orderable !== true)
		return { kind: "hidden", reason: "notOrderable" };
	if (input.productAvailable === false) {
		return { kind: "hidden", reason: "soldOut" };
	}
	return { kind: "buy", signedIn: input.signedIn };
}

/**
 * Web knows only the active shop; the app lists every shop the viewer
 * belongs to, so any membership counts.
 */
export function isOwnShop(input: {
	viewerId: string | null;
	sellerId: string | null;
	shopId: string | null;
	memberOf: readonly string[];
}): boolean {
	if (input.viewerId !== null && input.viewerId === input.sellerId) return true;
	return input.shopId !== null && input.memberOf.includes(input.shopId);
}

export interface SingleShopConflict {
	/** Null when the refusal did not say which shop the cart holds. */
	currentShop: { id: string; name: string | null } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function currentShopOf(
	data: unknown,
): { id: string; name: string | null } | null {
	if (!isRecord(data) || !isRecord(data.details)) return null;
	const shop = data.details.currentShop;
	if (!isRecord(shop) || typeof shop.id !== "string" || shop.id === "") {
		return null;
	}
	return {
		id: shop.id,
		name: typeof shop.name === "string" ? shop.name : null,
	};
}

/**
 * Whether a failed add should offer to replace the cart, read from the thrown
 * `ApiError` (its `data` is the whole body). Only `cart.singleShop`
 * qualifies, and not when the cart already holds the shop being added:
 * replacing it would empty it for nothing.
 */
export function singleShopConflict(
	error: unknown,
	addingShopId: string | null,
): SingleShopConflict | null {
	if (!isRecord(error) || error.code !== ERROR_CODES.cartSingleShop) {
		return null;
	}
	const currentShop = currentShopOf(error.data);
	if (currentShop && addingShopId !== null && currentShop.id === addingShopId) {
		return null;
	}
	return { currentShop };
}
