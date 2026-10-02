"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { cartKey, purchasesRootKey } from "~/lib/query-keys";
import { apiGet, apiPost, query } from "~/lib/shop-api";
import type {
	AddressInput,
	DeliveryOption,
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
	/** `checkout.termsNotAccepted` without it. The server reads this name. */
	termsAccepted: boolean;
	/**
	 * One UUID per checkout attempt. The server requires it: a double-tap or a
	 * retried request resolves to the first call's order instead of a second
	 * one. This type first shipped without it — guessed before the placement
	 * route landed — so every placement would have been refused.
	 */
	idempotencyKey: string;
}

export const checkoutQuoteKey = ["checkout", "quote"] as const;
export const checkoutPlaceKey = ["checkout", "place"] as const;
export const deliveryOptionsKey = (city: string, district: string) =>
	["checkout", "delivery-options", city, district] as const;

/**
 * `GET /api/checkout/delivery-options` — the delivery step's own source, so
 * the step never offers an option the quote would then refuse.
 */
export function useDeliveryOptions(
	city: string | null,
	district: string | null,
) {
	return useQuery<{ city: string; options: DeliveryOption[] }, ApiError>({
		queryKey: deliveryOptionsKey(city ?? "", district ?? ""),
		queryFn: () =>
			apiGet(
				`/api/checkout/delivery-options${query({
					city: city ?? undefined,
					district: district ?? undefined,
				})}`,
			),
		enabled: Boolean(city),
		retry: false,
	});
}

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
		mutationFn: (input) =>
			apiPost<PlaceResponse>("/api/checkout/place", {
				...input,
				source: "web",
			}),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: cartKey() });
			void queryClient.invalidateQueries({ queryKey: purchasesRootKey() });
		},
	});
}
