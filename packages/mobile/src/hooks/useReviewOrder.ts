import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { purchaseKey } from "./usePurchases";

export interface OrderReviewInput {
	rating: number;
	comment?: string;
}

/**
 * The buyer's review of the shop behind one order. It names only the order:
 * `enforceReviewRules` resolves the shop and its owner from it and marks the
 * purchase verified, so the client claims neither. Refetching the purchase is
 * what retires the panel, because `reviewable` turns false with it.
 */
export function useReviewOrder(orderId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: OrderReviewInput) =>
			api.post<unknown>("/api/reviews", { order: orderId, ...input }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: purchaseKey(orderId ?? "") }),
	});
}
