import type { BuyerCapRow, BuyerTierKey } from "./orderSettings";
import type { CodCaps } from "./shopCapabilities";

export interface CapCheckInput {
	orderTotal: number;
	openOrders: number;
	dailyOrders: number;
	shop: CodCaps;
	buyer: BuyerCapRow;
}

export type CapBreach = {
	scope: "shop" | "buyer";
	limit: "orderTotal" | "openOrders" | "dailyOrders";
} | null;

/**
 * The stricter of the two sets wins, and the breach names which one, because
 * `order.shopCapReached` and `order.buyerCapReached` are different sentences
 * to a buyer: one is "come back tomorrow", the other is "this shop cannot".
 * Limits are inclusive maxima.
 */
export function checkCaps(input: CapCheckInput): CapBreach {
	if (input.buyer.maxOpenOrders <= 0)
		return { scope: "buyer", limit: "openOrders" };
	if (input.orderTotal > input.shop.maxOrderTotal)
		return { scope: "shop", limit: "orderTotal" };
	if (
		input.buyer.maxOrderTotal !== null &&
		input.orderTotal > input.buyer.maxOrderTotal
	) {
		return { scope: "buyer", limit: "orderTotal" };
	}
	if (input.openOrders >= input.buyer.maxOpenOrders)
		return { scope: "buyer", limit: "openOrders" };
	if (input.openOrders >= input.shop.maxOpenOrders)
		return { scope: "shop", limit: "openOrders" };
	if (input.dailyOrders >= input.shop.maxDailyOrders)
		return { scope: "shop", limit: "dailyOrders" };
	return null;
}

/** `blocked` never reaches this function: the caller refuses with `order.codUnavailable` before quoting. */
export function confirmationPathFor(input: {
	tier: BuyerTierKey;
	deliveryPhoneIsVerifiedAccountPhone: boolean;
}): "none" | "sms_code" | "seller_call" {
	if (input.tier === "watch") return "seller_call";
	if (
		input.deliveryPhoneIsVerifiedAccountPhone &&
		(input.tier === "regular" || input.tier === "trusted")
	) {
		return "none";
	}
	return "sms_code";
}
