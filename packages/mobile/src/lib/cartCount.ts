import type { CartLineView, CartView, SplitCartView } from "../types/order";

/** Units in the cart, whichever shape `GET /api/cart` answered with. */
export function cartItemCount(
	cart: CartView | SplitCartView | null | undefined,
): number {
	if (!cart) return 0;
	const lines =
		"groups" in cart ? cart.groups.flatMap((group) => group.items) : cart.lines;
	return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export type AnyCart = CartView | SplitCartView;

/** The cart with one line changed (or removed with `null`), in either shape. */
export function patchCartLine(
	cart: AnyCart,
	lineId: string,
	change: (line: CartLineView) => CartLineView | null,
): AnyCart {
	const apply = (lines: CartLineView[]) =>
		lines.flatMap((line) => {
			if (line.id !== lineId) return [line];
			const next = change(line);
			return next ? [next] : [];
		});
	return "groups" in cart
		? {
				...cart,
				groups: cart.groups
					.map((group) => ({ ...group, items: apply(group.items) }))
					.filter((group) => group.items.length > 0),
			}
		: { ...cart, lines: apply(cart.lines) };
}
