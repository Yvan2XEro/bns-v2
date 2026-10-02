import type { CartLineView } from "../types/order";

/**
 * One line's money. `currentPrice` is null only when the listing or variant
 * can no longer be read at all, and such a line is always `unavailable`, so
 * the fallback to `priceAtAdd` exists to render a row rather than to charge
 * for it — `cartTotals` excludes the line from the subtotal either way.
 */
export function cartLineSubtotal(line: CartLineView): number {
	return (line.currentPrice ?? line.priceAtAdd) * line.quantity;
}

export interface CartTotals {
	subtotal: number;
	itemCount: number;
	unavailableCount: number;
	priceChangedCount: number;
}

/**
 * Mirrors `toCartView` in `packages/api/src/services/cart.ts`: an unavailable
 * line contributes nothing to either the subtotal or the item count, and an
 * available line is valued at `currentPrice`, never at the price it was added
 * at. The server's own `subtotal`/`itemCount` stay authoritative; this is for
 * the quantity stepper, which must show the new total before the round trip
 * that confirms it.
 */
export function cartTotals(lines: readonly CartLineView[]): CartTotals {
	let subtotal = 0;
	let itemCount = 0;
	let unavailableCount = 0;
	let priceChangedCount = 0;

	for (const line of lines) {
		if (line.unavailable) {
			unavailableCount += 1;
		} else {
			subtotal += (line.currentPrice ?? 0) * line.quantity;
			itemCount += line.quantity;
		}
		if (line.priceChanged) priceChangedCount += 1;
	}

	return { subtotal, itemCount, unavailableCount, priceChangedCount };
}
