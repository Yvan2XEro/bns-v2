import type { CartLineView, CartView } from "~/types/order";

/**
 * Pure arithmetic over a cart's lines. Nothing here decides a price: the
 * server sends `unitPrice` (what the buyer will actually be charged) and
 * `lineSubtotal`, and this only aggregates them the same way
 * `packages/api/src/services/cart.ts` does — unavailable lines contribute
 * neither to the subtotal nor to the unit count there, so they contribute to
 * neither here. A cart screen showing a different subtotal from the one the
 * checkout quote will charge is the defect this agreement exists to prevent.
 */
export interface CartTotals {
	/** Rows in the cart, available or not — what the screen renders. */
	lineCount: number;
	/** Units the buyer would actually pay for. */
	itemCount: number;
	subtotal: number;
	unavailableCount: number;
	priceChangedCount: number;
	/** Signed: positive when the cart has grown dearer since the items were added. */
	priceChangeDelta: number;
}

export function cartTotals(lines: readonly CartLineView[]): CartTotals {
	const totals: CartTotals = {
		lineCount: lines.length,
		itemCount: 0,
		subtotal: 0,
		unavailableCount: 0,
		priceChangedCount: 0,
		priceChangeDelta: 0,
	};

	for (const line of lines) {
		if (!line.available) {
			totals.unavailableCount += 1;
			continue;
		}
		totals.itemCount += line.quantity;
		totals.subtotal += line.lineSubtotal;
		if (line.priceChanged) {
			totals.priceChangedCount += 1;
			totals.priceChangeDelta +=
				(line.unitPrice - line.priceAtAdd) * line.quantity;
		}
	}

	return totals;
}

/**
 * Whether "place the order" is worth offering at all. Mirrors the three
 * refusals `assertCheckoutPreconditions` would answer with for a cart the
 * buyer can see: `cart.empty`, `cart.itemUnavailable`/`cart.outOfStock` on
 * any line, and `order.shopUnavailable`/`order.codUnavailable` for a shop
 * that can no longer take orders (which the API states as `shopOrderable`,
 * never recomputed here from a level or a flag).
 *
 * A price change does **not** block checkout: art. 17 is satisfied by the
 * quote step, where the buyer accepts the new summary.
 */
export function canCheckout(cart: CartView): boolean {
	const totals = cartTotals(cart.lines);
	return (
		cart.shopOrderable && totals.itemCount > 0 && totals.unavailableCount === 0
	);
}
