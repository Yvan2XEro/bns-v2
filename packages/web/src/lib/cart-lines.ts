import { z } from "zod";
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
 * The stepper never goes below one (removing is its own button) and never
 * above a tracked variant's stock. An untracked variant has no client-side
 * ceiling: the cart's own maximum is a server rule (`cart.quantityInvalid`)
 * and is not mirrored here.
 */
export function quantityStepper(line: CartLineView): QuantityStepper {
	if (cartLineState(line) === "unavailable") {
		return { canDecrease: false, canIncrease: false, atMax: false };
	}
	const atMax = line.maxQuantity !== null && line.quantity >= line.maxQuantity;
	return { canDecrease: line.quantity > 1, canIncrease: !atMax, atMax };
}

const singleShopRefusal = z.object({
	code: z.literal("cart.singleShop"),
	details: z.unknown().optional(),
});

const currentShopDetails = z.object({
	currentShop: z.object({ id: z.string().min(1), name: z.string().nullable() }),
});

export interface SingleShopConflict {
	/** Null when the refusal did not say which shop the cart holds. */
	currentShop: { id: string; name: string | null } | null;
}

/**
 * Whether a failed add should open the "replace the cart" dialog.
 *
 * Only `cart.singleShop` qualifies, and only when the shop already in the cart
 * is not the one being added: replacing a cart with items from its own shop
 * would empty it for nothing. When the shop being added is unknown (an add
 * replayed from a URL carries no shop id) the server's refusal is itself the
 * proof that the shops differ.
 */
export function singleShopConflict(
	error: unknown,
	addingShopId: string | null,
): SingleShopConflict | null {
	const refusal = singleShopRefusal.safeParse(error);
	if (!refusal.success) return null;
	const details = currentShopDetails.safeParse(refusal.data.details);
	if (!details.success) return { currentShop: null };
	const { currentShop } = details.data;
	if (addingShopId !== null && currentShop.id === addingShopId) return null;
	return { currentShop };
}

export interface AddToCartRequest {
	listingId: string;
	variantId: string;
	quantity: number;
}

/**
 * Reads the `addToCart=listingId:variantId:qty` parameter a signed-out add
 * carries through sign-in back to `/cart`. Anything malformed is ignored
 * rather than half-applied.
 */
export function parseAddToCart(
	value: string | null | undefined,
): AddToCartRequest | null {
	if (!value) return null;
	const parts = value.split(":");
	if (parts.length !== 3) return null;
	const [listingId, variantId, rawQuantity] = parts;
	if (!listingId || !variantId || !/^[1-9]\d*$/.test(rawQuantity)) return null;
	return { listingId, variantId, quantity: Number(rawQuantity) };
}
