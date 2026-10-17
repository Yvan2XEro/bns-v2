import type { CartView, SplitCartView } from "../types/order";

/** Units in the cart, whichever shape `GET /api/cart` answered with. */
export function cartItemCount(
	cart: CartView | SplitCartView | null | undefined,
): number {
	if (!cart) return 0;
	const lines =
		"groups" in cart ? cart.groups.flatMap((group) => group.items) : cart.lines;
	return lines.reduce((sum, line) => sum + line.quantity, 0);
}
