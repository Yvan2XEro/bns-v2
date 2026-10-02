import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import { api } from "../lib/api";
import type {
	DeliveryOption,
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
