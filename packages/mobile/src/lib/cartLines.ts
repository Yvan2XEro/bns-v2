import type { CartLineView, CartView } from "../types/order";

/**
 * One line's money. The server already states it as `lineSubtotal`; this
 * recomputes it from `unitPrice` so the quantity stepper can show the new
 * total before the round trip that confirms it, and never invents a price —
 * `unitPrice` is what the buyer will actually be charged.
 */
export function cartLineSubtotal(line: CartLineView): number {
	return line.unitPrice * line.quantity;
}

export interface CartTotals {
	subtotal: number;
	itemCount: number;
	unavailableCount: number;
	priceChangedCount: number;
}

/**
 * Mirrors `toCartView` in `packages/api/src/services/cart.ts`: a line that is
 * not `available` contributes nothing to either the subtotal or the item
 * count, and an available line is valued at `unitPrice`, never at the price it
 * was added at. The server's own `subtotal` stays authoritative; this is for
 * the stepper's optimistic total.
 */
export function cartTotals(lines: readonly CartLineView[]): CartTotals {
	let subtotal = 0;
	let itemCount = 0;
	let unavailableCount = 0;
	let priceChangedCount = 0;

	for (const line of lines) {
		if (line.available) {
			subtotal += cartLineSubtotal(line);
			itemCount += line.quantity;
		} else {
			unavailableCount += 1;
		}
		if (line.priceChanged) priceChangedCount += 1;
	}

	return { subtotal, itemCount, unavailableCount, priceChangedCount };
}

/**
 * The checkout button's gate: the shop still takes orders, something is
 * payable, and nothing in the cart is unavailable — the quote would refuse
 * any of the three.
 */
export function canCheckout(cart: CartView): boolean {
	const totals = cartTotals(cart.lines);
	return (
		cart.shopOrderable && totals.itemCount > 0 && totals.unavailableCount === 0
	);
}

export type CartLineState = "ok" | "price_changed" | "unavailable";

/** Unavailable wins: a price the buyer cannot pay is not worth announcing. */
export function cartLineState(line: CartLineView): CartLineState {
	if (!line.available) return "unavailable";
	if (line.priceChanged) return "price_changed";
	return "ok";
}

export interface QuantityStepper {
	canDecrease: boolean;
	canIncrease: boolean;
	/** The tracked stock is reached; the screen says why "+" is disabled. */
	atMax: boolean;
}

/**
 * Never below one (removing is its own button) and never above a tracked
 * variant's stock. An untracked variant has no client-side ceiling: the
 * cart's own maximum is a server rule (`cart.quantityInvalid`).
 */
export function quantityStepper(line: CartLineView): QuantityStepper {
	if (cartLineState(line) === "unavailable") {
		return { canDecrease: false, canIncrease: false, atMax: false };
	}
	const atMax = line.maxQuantity !== null && line.quantity >= line.maxQuantity;
	return { canDecrease: line.quantity > 1, canIncrease: !atMax, atMax };
}
