"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { ApiError } from "~/lib/apiError";
import { isTerminalStatus, pollIntervalMs } from "~/lib/payment-flow";
import { cartKey, paymentStatusKey, purchasesRootKey } from "~/lib/query-keys";
import { apiGet, apiPost, query } from "~/lib/shop-api";
import type {
	AddressInput,
	PaymentIntentResponse,
	PaymentMethod,
	PaymentStatusView,
	PlaceResponse,
	QuoteResponse,
} from "~/types/order";
import type { DeliveryQuote } from "../../../api/src/contracts/deliveryQuote";

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
export const deliveryOptionsKey = (
	city: string,
	district: string,
	paymentMethod: PaymentMethod = "cod",
) => ["checkout", "delivery-options", city, district, paymentMethod] as const;

/**
 * `GET /api/checkout/delivery-options` — the delivery step's own source, so
 * the step never offers an option the quote would then refuse.
 */
export function useDeliveryOptions(
	city: string | null,
	district: string | null,
	paymentMethod: PaymentMethod = "cod",
) {
	return useQuery<DeliveryQuote & { city: string }, ApiError>({
		queryKey: deliveryOptionsKey(city ?? "", district ?? "", paymentMethod),
		queryFn: () =>
			apiGet(
				`/api/checkout/delivery-options${query({
					city: city ?? undefined,
					district: district ?? undefined,
					paymentMethod,
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

export interface CreatePaymentIntentInput {
	channel: string;
	phone: string;
	/** Fresh per attempt — see `payment-flow.ts#freshAttempt`. */
	idempotencyKey: string;
}

/**
 * `POST /api/orders/{id}/payment-intents`. The header, not the body, carries
 * the idempotency key, so this is the one `shopApi` write that needs
 * `apiPost`'s `headers` parameter.
 */
export function useCreatePaymentIntent(orderId: string) {
	const queryClient = useQueryClient();
	return useMutation<PaymentIntentResponse, ApiError, CreatePaymentIntentInput>(
		{
			mutationKey: ["orders", orderId, "payment-intent"],
			mutationFn: ({ channel, phone, idempotencyKey }) =>
				apiPost<PaymentIntentResponse>(
					`/api/orders/${encodeURIComponent(orderId)}/payment-intents`,
					{ channel, phone },
					{ "Idempotency-Key": idempotencyKey },
				),
			retry: false,
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: paymentStatusKey(orderId),
				});
			},
		},
	);
}

/**
 * `GET /api/orders/{id}/payment`, polled per `pollIntervalMs` — 3 s for the
 * first 60 s of polling, then 10 s — and stopped once the latest intent
 * reaches a terminal status. `refetchInterval` is a function so TanStack
 * re-reads the cadence after every fetch instead of a timer this hook would
 * have to clear by hand.
 */
export function usePaymentStatus(orderId: string | null, enabled = true) {
	const startedAtRef = useRef(Date.now());
	return useQuery<PaymentStatusView, ApiError>({
		queryKey: paymentStatusKey(orderId ?? ""),
		queryFn: () =>
			apiGet<PaymentStatusView>(
				`/api/orders/${encodeURIComponent(orderId ?? "")}/payment`,
			),
		enabled: Boolean(orderId) && enabled,
		retry: false,
		refetchInterval: (q) => {
			const intent = q.state.data?.intent;
			if (!intent || isTerminalStatus(intent.status)) return false;
			return pollIntervalMs(Date.now() - startedAtRef.current);
		},
	});
}
