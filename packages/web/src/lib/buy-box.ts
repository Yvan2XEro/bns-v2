import type { LaunchCityOption } from "~/types/order";
import type { AddToCartRequest } from "./cart-lines";

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
 * Whether the listing page shows the buy box. This does not re-decide what
 * the API's `orderable` already decided; it only adds what the page itself
 * knows (the client flag, who is looking) and picks the restricted notice
 * the spec asks for over a silent page. Anything but `buy` leaves the page
 * as it was before ordering existed.
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

export interface DeliveryLineInput {
	city: string | null;
	sellerDeliveryEnabled: boolean;
	deliveryFee: number | null;
	pickupEnabled: boolean;
	pickupAddress: string | null;
}

export interface DeliveryLine {
	delivery: { city: string; fee: number } | null;
	pickup: boolean;
}

/**
 * The listing's "Livraison à Douala : 2 000 FCFA · Retrait gratuit" line. It
 * reads the same two settings `quoteDelivery` does (the shop's own fee, else
 * the launch city's default) but it is a preview only: the checkout quote is
 * what the buyer is charged, and it is recomputed server-side.
 */
export function deliveryLine(
	shop: DeliveryLineInput,
	launchCities: readonly LaunchCityOption[],
): DeliveryLine | null {
	const city = launchCities.find((option) => option.key === shop.city);
	const delivery =
		shop.sellerDeliveryEnabled && city
			? { city: city.label, fee: shop.deliveryFee ?? city.fee }
			: null;
	const pickup = shop.pickupEnabled && Boolean(shop.pickupAddress);
	if (!delivery && !pickup) return null;
	return { delivery, pickup };
}

/**
 * A signed-out add goes through the existing `/auth/login?redirect=` (read
 * through `safeReturnTo`) back to `/cart?addToCart=…`, which replays it once.
 */
export function signInToAddHref(request: AddToCartRequest): string {
	const add = `${request.listingId}:${request.variantId}:${request.quantity}`;
	const back = `/cart?addToCart=${encodeURIComponent(add)}`;
	return `/auth/login?redirect=${encodeURIComponent(back)}`;
}
