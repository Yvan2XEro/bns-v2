import type { CartLineView } from "../types/order";

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
