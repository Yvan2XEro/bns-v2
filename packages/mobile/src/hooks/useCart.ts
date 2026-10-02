import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { CartView } from "../types/order";

/**
 * One active cart per buyer, so no parameter and no shop scope: the cart is
 * the buyer's, and the shop it belongs to is a property of its contents
 * (`cart.singleShop` is the server's rule, not a key here).
 */
export const cartKey = ["cart"] as const;

export function useCart() {
	const { user } = useAuth();
	return useQuery({
		queryKey: cartKey,
		queryFn: () => api.get<CartView>("/api/cart"),
		enabled: Boolean(user),
	});
}

function useInvalidateCart() {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: cartKey });
	};
}

export interface AddCartItemInput {
	listingId: string;
	variantId: string;
	quantity: number;
	/** True when the buyer chose to drop another shop's cart (`cart.singleShop`). */
	replace?: boolean;
}

/**
 * Every write answers with the whole revalidated `CartView` — current prices,
 * availability and the subtotal recomputed server-side — so these invalidate
 * rather than patch: the response is already the next state, and a hand-written
 * cache patch would be a second place for the single-shop and stock rules to
 * live.
 */
export function useAddCartItem() {
	const invalidate = useInvalidateCart();
	return useMutation({
		mutationFn: (input: AddCartItemInput) =>
			api.post<CartView>("/api/cart/items", input),
		onSuccess: invalidate,
	});
}

export function useSetCartItemQuantity() {
	const invalidate = useInvalidateCart();
	return useMutation({
		mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) =>
			api.patch<CartView>(`/api/cart/items/${encodeURIComponent(lineId)}`, {
				quantity,
			}),
		onSuccess: invalidate,
	});
}

export function useRemoveCartItem() {
	const invalidate = useInvalidateCart();
	return useMutation({
		mutationFn: (lineId: string) =>
			api.delete<CartView>(`/api/cart/items/${encodeURIComponent(lineId)}`),
		onSuccess: invalidate,
	});
}

export function useClearCart() {
	const invalidate = useInvalidateCart();
	return useMutation({
		mutationFn: () => api.delete<CartView>("/api/cart"),
		onSuccess: invalidate,
	});
}
