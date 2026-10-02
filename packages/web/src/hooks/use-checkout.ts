"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { cartKey, purchasesRootKey } from "~/lib/query-keys";
import { apiPost } from "~/lib/shop-api";
import type {
	AddressInput,
	PaymentMethod,
	PlaceResponse,
	QuoteResponse,
} from "~/types/order";

export interface CheckoutQuoteInput {
	address: AddressInput;
	/** `"seller_delivery:{city}"` or `"pickup:{shopId}"`. */
	deliveryOptionId: string;
	paymentMethod: PaymentMethod;
	locale?: "fr" | "en";
}

export interface CheckoutPlaceInput extends CheckoutQuoteInput {
	/**
	 * The hash the quote answered with. `placeOrder` recomputes it and answers
	 * `checkout.quoteChanged` on a mismatch, which is what forces the buyer to
	 * accept the new summary (art. 17) rather than the one they last saw.
	 */
	quoteHash: string;
	/** `checkout.termsNotAccepted` without it. */
	acceptTerms: boolean;
}

export const checkoutQuoteKey = ["checkout", "quote"] as const;
export const checkoutPlaceKey = ["checkout", "place"] as const;

/**
 * A mutation, not a query: the quote is a `POST` that recomputes prices,
 * fees, the pre-contract and the rate-limit counters on every call, and it is
 * requested when the buyer moves to the review step — never on render. There
 * is nothing to cache, because a cached quote is exactly the stale summary
 * `checkout.quoteChanged` exists to refuse.
 */
export function useCheckoutQuote() {
	return useMutation<QuoteResponse, ApiError, CheckoutQuoteInput>({
		mutationKey: checkoutQuoteKey,
		mutationFn: (input) => apiPost<QuoteResponse>("/api/checkout/quote", input),
		retry: false,
	});
}

/**
 * Placement. On success the cart is gone (`markCartConverted`) and the buyer
 * has a new purchase, so both roots are invalidated here rather than by the
 * confirmation screen — the screen that navigates is not the screen that
 * knows what changed.
 */
export function usePlaceOrder() {
	const queryClient = useQueryClient();
	return useMutation<PlaceResponse, ApiError, CheckoutPlaceInput>({
		mutationKey: checkoutPlaceKey,
		mutationFn: (input) => apiPost<PlaceResponse>("/api/checkout/place", input),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: cartKey() });
			void queryClient.invalidateQueries({ queryKey: purchasesRootKey() });
		},
	});
}
