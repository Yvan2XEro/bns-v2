"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import type { OrderStatusName } from "~/lib/order-status";
import { purchaseKey, purchasesKey } from "~/lib/query-keys";
import { apiGet, query } from "~/lib/shop-api";
import type { OrderPage, OrderView } from "~/types/order";

export { purchaseKey, purchasesKey, purchasesRootKey } from "~/lib/query-keys";

export interface PurchaseFilters {
	status?: OrderStatusName;
}

/**
 * The buyer's own orders, newest first, paged with the server's cursor.
 * `role=buyer` is sent explicitly: `GET /api/orders` requires it rather than
 * inferring it, so a later audience can be added without breaking callers
 * that already pin the buyer.
 */
export function usePurchases(filters: PurchaseFilters = {}) {
	return useInfiniteQuery<OrderPage, ApiError>({
		queryKey: purchasesKey(filters),
		queryFn: ({ pageParam }) =>
			apiGet<OrderPage>(
				`/api/orders${query({
					role: "buyer",
					status: filters.status,
					cursor: pageParam as string | undefined,
				})}`,
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		retry: false,
	});
}

/** One purchase, as the buyer's audience sees it. */
export function usePurchase(orderId: string | null) {
	return useQuery<OrderView, ApiError>({
		queryKey: purchaseKey(orderId ?? ""),
		queryFn: () =>
			apiGet<OrderView>(`/api/orders/${encodeURIComponent(orderId ?? "")}`),
		enabled: Boolean(orderId),
		retry: false,
	});
}
