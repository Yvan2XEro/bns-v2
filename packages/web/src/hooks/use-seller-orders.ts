"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import type { ShopOrderTab } from "~/lib/order-status";
import { shopOrderKey, shopOrdersKey } from "~/lib/query-keys";
import { apiGet, query } from "~/lib/shop-api";
import type { OrderView, ShopOrderPage } from "~/types/order";

export {
	shopOrderKey,
	shopOrdersKey,
	shopOrdersRootKey,
} from "~/lib/query-keys";

export interface SellerOrderFilters {
	tab: ShopOrderTab;
	/** Matches the order number or the recipient's name, server-side. */
	q?: string;
}

/**
 * One shop's order queue for one tab. `tab` is required because the route
 * requires it — an absent or unknown value is a `generic.badRequest` there,
 * never a silent "every status" fallback — and `counts` comes back narrowed by
 * the same `q` as the rows, so the tab bar and the open tab always agree.
 */
export function useSellerOrders(
	shopId: string | null,
	filters: SellerOrderFilters,
) {
	return useInfiniteQuery<ShopOrderPage, ApiError>({
		queryKey: shopOrdersKey(shopId ?? "", filters),
		queryFn: ({ pageParam }) =>
			apiGet<ShopOrderPage>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/orders${query({
					tab: filters.tab,
					q: filters.q,
					cursor: pageParam as string | undefined,
				})}`,
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		enabled: Boolean(shopId),
		retry: false,
	});
}

/**
 * One order as the fulfilling shop sees it. The route is the audience-neutral
 * `GET /api/orders/{id}`; the shop id is carried only in the query key, so
 * the seller's copy and the buyer's copy of the same order are separate cache
 * entries and a shop-wide invalidation reaches this one alone.
 */
export function useSellerOrder(shopId: string | null, orderId: string | null) {
	return useQuery<OrderView, ApiError>({
		queryKey: shopOrderKey(shopId ?? "", orderId ?? ""),
		queryFn: () =>
			apiGet<OrderView>(`/api/orders/${encodeURIComponent(orderId ?? "")}`),
		enabled: Boolean(shopId && orderId),
		retry: false,
	});
}
