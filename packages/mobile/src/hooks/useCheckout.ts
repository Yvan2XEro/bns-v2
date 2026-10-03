import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { api } from "../lib/api";
import { shouldRefetchOnForeground } from "../lib/paymentFlow";
import type { PaymentChannel } from "../lib/paymentStatus";
import type {
	DeliveryOption,
	PaymentIntentResponse,
	PaymentStatusView,
	PlaceInput,
	PlaceResponse,
	QuoteInput,
	QuoteResponse,
} from "../types/order";
import { cartKey } from "./useCart";
import { purchasesRootKey } from "./usePurchases";

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
	const params = new URLSearchParams();
	if (city) params.set("city", city);
	if (district) params.set("district", district);
	return useQuery({
		queryKey: deliveryOptionsKey(city ?? "", district ?? ""),
		queryFn: () =>
			api.get<{ city: string; options: DeliveryOption[] }>(
				`/api/checkout/delivery-options?${params.toString()}`,
			),
		enabled: Boolean(city),
	});
}

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
		// The platform is pinned here, not in a screen: every order this app
		// places used to be recorded as "web", because the service's default is
		// the only value that ever reached it.
		mutationFn: (input: PlaceInput) =>
			api.post<PlaceResponse>("/api/checkout/place", {
				...input,
				source: Platform.OS === "ios" ? "ios" : "android",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: cartKey });
			queryClient.invalidateQueries({ queryKey: purchasesRootKey });
		},
	});
}

// ─── Protected payment (P5) ─────────────────────────────────────────────────

/** The server verifies a pending attempt at most every 20s
 * (`POLL_INTERVAL_SECONDS` in `checkoutPayment.ts`). */
const PAYMENT_POLL_INTERVAL_MS = 20_000;

export const paymentStatusKey = (orderId: string) =>
	["orders", orderId, "payment"] as const;

/**
 * `POST /api/orders/{id}/payment-intents`. The `Idempotency-Key` header is
 * the server's own de-dup key, not the body: a retried call with the same
 * key replays the first attempt's answer instead of starting a second one.
 */
export function useCreatePaymentIntent(orderId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			channel: PaymentChannel;
			phone: string;
			idempotencyKey: string;
		}) =>
			api.post<PaymentIntentResponse>(
				`/api/orders/${orderId}/payment-intents`,
				{ channel: input.channel, phone: input.phone },
				{ "Idempotency-Key": input.idempotencyKey },
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: paymentStatusKey(orderId) });
		},
	});
}

/**
 * `GET /api/orders/{id}/payment`. Polls while an attempt is open, and also
 * refetches when the app returns to the foreground — the buyer leaves the
 * app to approve the USSD prompt, and that return is the only signal a
 * dismissed approval gives outside the poll. `shouldRefetchOnForeground`
 * (pure, tested in `paymentFlow.test.ts`) decides whether a given foreground
 * event is worth the request.
 */
export function usePaymentStatus(orderId: string | undefined) {
	const query = useQuery({
		queryKey: paymentStatusKey(orderId ?? ""),
		queryFn: () => api.get<PaymentStatusView>(`/api/orders/${orderId}/payment`),
		enabled: Boolean(orderId),
		refetchInterval: (q) => {
			const status = q.state.data?.intent?.status;
			return status === "created" || status === "pending"
				? PAYMENT_POLL_INTERVAL_MS
				: false;
		},
	});

	const refetchRef = useRef(query.refetch);
	refetchRef.current = query.refetch;
	const lastCheckedAtRef = useRef(Date.now());

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (nextState) => {
			if (nextState !== "active") return;
			const now = Date.now();
			if (!shouldRefetchOnForeground(lastCheckedAtRef.current, now)) return;
			lastCheckedAtRef.current = now;
			void refetchRef.current();
		});
		return () => subscription.remove();
	}, []);

	return query;
}
