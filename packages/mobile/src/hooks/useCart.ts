import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { track } from "@/src/lib/monitoring";
import { ANALYTICS_EVENTS } from "../../../api/src/contracts/monitoring";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { type AnyCart, patchCartLine } from "../lib/cartCount";
import { hapticOutcome } from "../lib/haptics";
import type { CartLineView, CartView, SplitCartView } from "../types/order";

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
		queryFn: () => api.get<CartView | SplitCartView>("/api/cart"),
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
		onSuccess: (_cart, input) => {
			hapticOutcome("success");
			track(ANALYTICS_EVENTS.addToCart, {
				listing_id: input.listingId,
				quantity: input.quantity,
			});
			invalidate();
		},
		onError: () => hapticOutcome("error"),
	});
}

/**
 * The change shows at once; the server's revalidated cart replaces it when
 * it answers, and a refusal puts the previous cart back.
 */
function useOptimisticCartLine<TVars>(
	lineIdOf: (vars: TVars) => string,
	change: (vars: TVars) => (line: CartLineView) => CartLineView | null,
) {
	const queryClient = useQueryClient();
	return {
		onMutate: async (vars: TVars) => {
			await queryClient.cancelQueries({ queryKey: cartKey });
			const previous = queryClient.getQueryData<AnyCart>(cartKey);
			if (previous)
				queryClient.setQueryData<AnyCart>(
					cartKey,
					patchCartLine(previous, lineIdOf(vars), change(vars)),
				);
			return { previous };
		},
		onError: (
			_error: unknown,
			_vars: TVars,
			context: { previous?: AnyCart } | undefined,
		) => {
			if (context?.previous)
				queryClient.setQueryData(cartKey, context.previous);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: cartKey });
		},
	};
}

export function useSetCartItemQuantity() {
	const optimistic = useOptimisticCartLine(
		(vars: { lineId: string; quantity: number }) => vars.lineId,
		({ quantity }) =>
			(line) => ({
				...line,
				quantity,
				lineSubtotal: line.unitPrice * quantity,
			}),
	);
	return useMutation({
		mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) =>
			api.patch<CartView>(`/api/cart/items/${encodeURIComponent(lineId)}`, {
				quantity,
			}),
		...optimistic,
	});
}

export function useRemoveCartItem() {
	const optimistic = useOptimisticCartLine(
		(lineId: string) => lineId,
		() => () => null,
	);
	return useMutation({
		mutationFn: (lineId: string) =>
			api.delete<CartView>(`/api/cart/items/${encodeURIComponent(lineId)}`),
		...optimistic,
	});
}

export function useClearCart() {
	const invalidate = useInvalidateCart();
	return useMutation({
		mutationFn: () => api.delete<CartView>("/api/cart"),
		onSuccess: invalidate,
	});
}
