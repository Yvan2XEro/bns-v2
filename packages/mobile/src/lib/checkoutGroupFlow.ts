import type {
	CheckoutGroupOrderView,
	CheckoutGroupView,
} from "../../../api/src/contracts/checkoutGroup";
import type {
	AddressInput,
	CartView,
	OrderListEntry,
	PaymentMethod,
	QuoteResponse,
	SplitCartView,
	SplitPlaceInput,
	SplitQuoteView,
} from "../types/order";
import { ERROR_CODES } from "./apiError";

/**
 * Pure decisions behind the grouped cart, the per-group review and the group
 * screen; the twin of web's `checkout-group-flow.ts`. Totals and
 * `payableNow` are the server's, rendered as given and never rebuilt here.
 */

// The flag is not served to clients; the cart and quote answer in the split
// shape exactly while it is on, so the shape is the switch.
export function isSplitCart(
	cart: CartView | SplitCartView,
): cart is SplitCartView {
	return "groups" in cart;
}

export function isSplitQuote(
	quote: QuoteResponse | SplitQuoteView,
): quote is SplitQuoteView {
	return "groups" in quote;
}

export function cartIsEmpty(cart: CartView | SplitCartView): boolean {
	return isSplitCart(cart) ? cart.groups.length === 0 : cart.lines.length === 0;
}

/** Nothing unavailable anywhere and at least one line to buy; the quote refuses the rest. */
export function splitCanCheckout(cart: SplitCartView): boolean {
	const lines = cart.groups.flatMap((group) => group.items);
	return lines.length > 0 && lines.every((line) => line.available);
}

export type OrderStep = "paid" | "expired" | "pending";

export interface GroupFlow {
	/** Mobile-money siblings only; a cash-on-delivery order has nothing to pay. */
	steps: Array<{ orderId: string; state: OrderStep }>;
	/** The first sibling the server still lets the buyer pay. */
	next: string | null;
	position: { n: number; total: number } | null;
	summary: { paid: number; expired: number; pending: number };
	done: boolean;
}

function stepOf(order: CheckoutGroupOrderView): OrderStep {
	if (order.paymentStatus === "paid") return "paid";
	return order.payableNow ? "pending" : "expired";
}

export function checkoutGroupFlow(view: CheckoutGroupView): GroupFlow {
	const payable = view.orders.filter((o) => o.paymentMethod === "mobile_money");
	const steps = payable.map((order) => ({
		orderId: order.id,
		state: stepOf(order),
	}));
	const nextIndex = payable.findIndex((order) => order.payableNow);
	const count = (state: OrderStep) =>
		steps.filter((step) => step.state === state).length;
	return {
		steps,
		next: nextIndex === -1 ? null : (payable[nextIndex]?.id ?? null),
		position:
			nextIndex === -1 ? null : { n: nextIndex + 1, total: payable.length },
		summary: {
			paid: count("paid"),
			expired: count("expired"),
			pending: count("pending"),
		},
		done: nextIndex === -1,
	};
}

/** The reason a group is left out of the quote, as a locale key. */
export function unavailableReasonKey(code: string): string {
	switch (code) {
		case ERROR_CODES.checkoutCityNotServed:
			return "checkoutGroup.unavailable_not_served";
		case ERROR_CODES.orderCodUnavailable:
		case ERROR_CODES.checkoutMethodUnavailable:
			return "checkoutGroup.unavailable_cod_not_allowed";
		case ERROR_CODES.orderShopUnavailable:
		case ERROR_CODES.shopInactive:
			return "checkoutGroup.unavailable_shop_inactive";
		default:
			return "checkoutGroup.unavailable_other";
	}
}

export function splitPlaceBody(input: {
	address: AddressInput;
	quote: SplitQuoteView;
	paymentMethod: PaymentMethod;
	deliveryByGroup: Record<string, string>;
	accepted: boolean;
	idempotencyKey: string;
	locale: "fr" | "en";
}): SplitPlaceInput | null {
	if (!input.accepted) return null;
	return {
		address: input.address,
		paymentMethod: input.paymentMethod,
		locale: input.locale,
		deliveryByGroup: input.deliveryByGroup,
		quoteHash: input.quote.quoteHash,
		termsAccepted: true,
		idempotencyKey: input.idempotencyKey,
	};
}

export type PurchaseListItem =
	| { kind: "header"; checkoutGroup: string }
	| { kind: "order"; entry: OrderListEntry };

/** Siblings keep their own rows; one header opens the group at its first sibling. */
export function withGroupHeaders(
	entries: readonly OrderListEntry[],
): PurchaseListItem[] {
	const seen = new Set<string>();
	const items: PurchaseListItem[] = [];
	for (const entry of entries) {
		const group = entry.checkoutGroup;
		if (group && !seen.has(group)) {
			seen.add(group);
			items.push({ kind: "header", checkoutGroup: group });
		}
		items.push({ kind: "order", entry });
	}
	return items;
}
