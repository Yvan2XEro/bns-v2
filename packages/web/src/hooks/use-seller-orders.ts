"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import type { ShopOrderTab } from "~/lib/order-status";
import {
	shopOrderKey,
	shopOrdersKey,
	shopOrdersRootKey,
} from "~/lib/query-keys";
import { apiGet, query } from "~/lib/shop-api";
import type { OrderView, ShopOrderPage } from "~/types/order";

export {
	shopOrderKey,
	shopOrdersKey,
	shopOrdersRootKey,
} from "~/lib/query-keys";

export interface SellerOrderFilters {
	tab: ShopOrderTab | "all";
	/** Matches the order number or the recipient's name, server-side. */
	q?: string;
	/** A `delivery.district` key such as `douala.makepe`. */
	district?: string;
	/** ISO datetime: orders placed at or after it. */
	since?: string;
}

export interface SellerOrderQueue {
	toAccept: number;
	toShip: number;
}

export interface SellerOrderWeek {
	since: string;
	orders: number;
	delivered: number;
	refused: number;
	deliveredSales: number;
	/** Null for a member without `payments.view`. */
	commission: { amount: number; rateBps: number | null } | null;
}

/**
 * One shop's order queue for one tab, or `all`. `tab` is required because the
 * route requires it — an absent or unknown value is a `generic.badRequest`
 * there. `counts` follows the district and period filters but never `q`, so
 * the tab bar keeps saying how much work is waiting while the seller searches.
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
					district: filters.district,
					since: filters.since,
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

/**
 * The sidebar's and dashboard's "to process" counts. Keyed under the queue
 * root, so the invalidation every order action already makes refreshes them.
 */
export function useSellerOrderQueue(shopId: string | null) {
	return useQuery<SellerOrderQueue, ApiError>({
		queryKey: [...shopOrdersRootKey(shopId ?? ""), "queue"],
		queryFn: () =>
			apiGet<SellerOrderQueue>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/orders/queue`,
			),
		enabled: Boolean(shopId),
		retry: false,
		staleTime: 30_000,
	});
}

/** The dashboard's rolling seven days. */
export function useSellerOrderWeek(shopId: string | null) {
	return useQuery<SellerOrderWeek, ApiError>({
		queryKey: [...shopOrdersRootKey(shopId ?? ""), "week"],
		queryFn: () =>
			apiGet<SellerOrderWeek>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/orders/week`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}
