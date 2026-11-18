import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import { track } from "@/src/lib/monitoring";
import { askForPushInContext } from "@/src/lib/notifications";
import type { CheckoutGroupView } from "../../../api/src/contracts/checkoutGroup";
import { ANALYTICS_EVENTS } from "../../../api/src/contracts/monitoring";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { checkoutGroupFlow } from "../lib/checkoutGroupFlow";
import type {
	SplitPlaceInput,
	SplitQuoteInput,
	SplitQuoteView,
} from "../types/order";
import { savedAddressesKey } from "./useAddresses";
import { cartKey } from "./useCart";
import { purchasesRootKey } from "./usePurchases";

/** Siblings are paid one at a time, so the group re-reads at the payment poll's pace. */
const GROUP_POLL_INTERVAL_MS = 20_000;

export const checkoutGroupKey = (group: string) =>
	["checkout", "group", group] as const;

/** `GET /api/checkout/groups/{group}`: buyer only, one row per sibling. */
export function useCheckoutGroup(group: string | undefined) {
	const { user } = useAuth();
	return useQuery({
		queryKey: checkoutGroupKey(group ?? ""),
		queryFn: () =>
			api.get<CheckoutGroupView>(
				`/api/checkout/groups/${encodeURIComponent(group ?? "")}`,
			),
		enabled: Boolean(group) && Boolean(user),
		refetchInterval: (q) =>
			q.state.data && !checkoutGroupFlow(q.state.data).done
				? GROUP_POLL_INTERVAL_MS
				: false,
	});
}

/** A read that needs a body, and whose hash the place call echoes: a mutation, like the flat quote. */
export function useSplitQuote() {
	return useMutation({
		mutationFn: (input: SplitQuoteInput) =>
			api.post<SplitQuoteView>("/api/checkout/quote", input),
	});
}

export interface SplitPlaceResponse {
	checkoutGroup: string;
	orders: Array<{
		id: string;
		orderNumber: string;
		total: number;
		currency: string;
		paymentMethod: "cod" | "mobile_money";
	}>;
}

export function useSplitPlace() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: SplitPlaceInput) =>
			api.post<SplitPlaceResponse>("/api/checkout/place", {
				...input,
				source: Platform.OS === "ios" ? "ios" : "android",
			}),
		onSuccess: (_placed, input) => {
			track(ANALYTICS_EVENTS.orderPlaced, {
				payment_method: input.paymentMethod,
				split: true,
			});
			// The order's progress arrives by push: now is when that is worth asking.
			void askForPushInContext();
			queryClient.invalidateQueries({ queryKey: cartKey });
			queryClient.invalidateQueries({ queryKey: purchasesRootKey });
			if (input.saveAddress)
				queryClient.invalidateQueries({ queryKey: savedAddressesKey });
		},
	});
}
