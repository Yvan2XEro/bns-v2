"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { cartKey } from "~/lib/query-keys";
import { apiDelete, apiGet, apiPatch, apiPost } from "~/lib/shop-api";
import type { CartView } from "~/types/order";

export { cartKey };

export interface AddCartItemInput {
	listingId: string;
	variantId: string;
	quantity: number;
	/**
	 * `true` empties the cart first. `POST /api/cart/items` answers
	 * `cart.singleShop` without it when the cart already holds another shop's
	 * lines, and that error's `details.currentShop` is what the dialog shows
	 * before the buyer agrees to replace.
	 */
	replace?: boolean;
}

/**
 * The buyer's active cart. Every cart route answers the whole `CartView`, so
 * one query key serves the page, the header count and the checkout entry.
 */
export function useCart(enabled = true) {
	return useQuery<CartView, ApiError>({
		queryKey: cartKey(),
		queryFn: () => apiGet<CartView>("/api/cart"),
		enabled,
		retry: false,
	});
}

/**
 * The four mutations share one invalidation because they share one resource:
 * the server returns the recomputed cart from each of them, and re-reading it
 * is cheaper to keep honest than four hand-written cache writes would be
 * (stock and prices are revalidated server-side on every read).
 */
function useCartMutation<TInput>(
	mutationKey: readonly unknown[],
	mutationFn: (input: TInput) => Promise<CartView>,
) {
	const queryClient = useQueryClient();
	return useMutation<CartView, ApiError, TInput>({
		mutationKey,
		mutationFn,
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: cartKey() });
		},
	});
}

export function useAddCartItem() {
	return useCartMutation<AddCartItemInput>(["cart", "add"], (input) =>
		apiPost<CartView>("/api/cart/items", input),
	);
}

export function useSetCartItemQuantity() {
	return useCartMutation<{ lineId: string; quantity: number }>(
		["cart", "quantity"],
		({ lineId, quantity }) =>
			apiPatch<CartView>(`/api/cart/items/${encodeURIComponent(lineId)}`, {
				quantity,
			}),
	);
}

export function useRemoveCartItem() {
	return useCartMutation<string>(["cart", "remove"], (lineId) =>
		apiDelete<CartView>(`/api/cart/items/${encodeURIComponent(lineId)}`),
	);
}

export function useClearCart() {
	return useCartMutation<void>(["cart", "clear"], () =>
		apiDelete<CartView>("/api/cart"),
	);
}
