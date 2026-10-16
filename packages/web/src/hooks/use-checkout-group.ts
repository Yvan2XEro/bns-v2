"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { savedAddressesKey } from "~/hooks/use-addresses";
import type { ApiError } from "~/lib/apiError";
import { cartKey, checkoutGroupKey, purchasesRootKey } from "~/lib/query-keys";
import { apiGet, apiPost } from "~/lib/shop-api";
import type {
	AddressInput,
	PaymentMethod,
	SplitPlaceResponse,
	SplitQuoteView,
} from "~/types/order";
import type { CheckoutGroupView } from "../../../api/src/contracts/checkoutGroup";

export { checkoutGroupKey };

export interface SplitQuoteInput {
	address: AddressInput;
	paymentMethod: PaymentMethod;
	/** groupKey -> optionId; a group left out takes the server's default. */
	deliveryByGroup?: Record<string, string>;
	locale?: "fr" | "en";
}

export interface SplitPlaceInput extends SplitQuoteInput {
	quoteHash: string;
	termsAccepted: boolean;
	idempotencyKey: string;
	groupKeys: string[];
	saveAddress?: { label?: string };
}

export function useSplitQuote() {
	return useMutation<SplitQuoteView, ApiError, SplitQuoteInput>({
		mutationKey: ["checkout", "split-quote"],
		mutationFn: (input) =>
			apiPost<SplitQuoteView>("/api/checkout/quote", input),
		retry: false,
	});
}

export function useSplitPlace() {
	const queryClient = useQueryClient();
	return useMutation<SplitPlaceResponse, ApiError, SplitPlaceInput>({
		mutationKey: ["checkout", "split-place"],
		mutationFn: (input) =>
			apiPost<SplitPlaceResponse>("/api/checkout/place", {
				...input,
				source: "web",
			}),
		retry: false,
		onSuccess: (_placed, input) => {
			void queryClient.invalidateQueries({ queryKey: cartKey() });
			void queryClient.invalidateQueries({ queryKey: purchasesRootKey() });
			if (input.saveAddress)
				void queryClient.invalidateQueries({ queryKey: savedAddressesKey() });
		},
	});
}

/** The sibling orders of one split checkout; refetched on focus so a payment made elsewhere shows. */
export function useCheckoutGroup(group: string) {
	return useQuery<CheckoutGroupView, ApiError>({
		queryKey: checkoutGroupKey(group),
		queryFn: () =>
			apiGet<CheckoutGroupView>(
				`/api/checkout/groups/${encodeURIComponent(group)}`,
			),
		retry: false,
	});
}
