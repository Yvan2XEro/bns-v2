import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type {
	PlaceInput,
	PlaceResponse,
	QuoteInput,
	QuoteResponse,
} from "../types/order";
import { cartKey } from "./useCart";
import { purchasesRootKey } from "./usePurchases";

/**
 * `POST /api/checkout/quote` is a read that needs a body, so it is a mutation
 * rather than a query: its answer carries a `quoteHash` the place call must
 * echo back, and caching that under a key would be caching a one-shot token.
 */
export function useCheckoutQuote() {
	return useMutation({
		mutationFn: (input: QuoteInput) =>
			api.post<QuoteResponse>("/api/checkout/quote", input),
	});
}

/**
 * `POST /api/checkout/place` (built by Task 19). Empties the cart server-side
 * and creates the order, so both roots are dropped: the cart the buyer just
 * spent, and the purchase list the new order belongs at the top of.
 */
export function usePlaceOrder() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: PlaceInput) =>
			api.post<PlaceResponse>("/api/checkout/place", input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: cartKey });
			queryClient.invalidateQueries({ queryKey: purchasesRootKey });
		},
	});
}
