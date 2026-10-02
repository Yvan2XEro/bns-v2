import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ShopOrderTab } from "../lib/orderStatus";
import type { OrderView, ShopOrderPage } from "../types/order";

/** `tab` is required by the route; `cursor` stays out of the key. */
export interface SellerOrderFilters {
	tab: ShopOrderTab;
	q?: string;
}

/**
 * Nested under the existing `["shops", shopId, …]` scope, so the shop
 * mutations already in `useShops.ts` (`useInvalidateShop`, which drops
 * `["shops"]`) reach these without anyone having to remember them.
 */
export const shopOrdersRootKey = (shopId: string) =>
	["shops", shopId, "orders"] as const;

export const shopOrdersKey = (shopId: string, filters: SellerOrderFilters) =>
	["shops", shopId, "orders", "list", filters] as const;

export const shopOrderKey = (shopId: string, orderId: string) =>
	["shops", shopId, "orders", "detail", orderId] as const;

/**
 * One tab's rows plus every tab's count, so the tab bar and the rows behind
 * the open tab can never disagree. The counts narrow with `q` exactly as the
 * rows do (`listShopOrders`), which is why `q` is part of the key.
 */
export function useSellerOrders(
	shopId: string | undefined,
	filters: SellerOrderFilters,
) {
	return useInfiniteQuery({
		queryKey: shopOrdersKey(shopId ?? "", filters),
		queryFn: ({ pageParam }: { pageParam: string | undefined }) => {
			const search = new URLSearchParams({ tab: filters.tab });
			if (filters.q) search.set("q", filters.q);
			if (pageParam) search.set("cursor", pageParam);
			return api.get<ShopOrderPage>(
				`/api/shops/${shopId}/orders?${search.toString()}`,
			);
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		enabled: Boolean(shopId),
	});
}

/** The same `GET /api/orders/{id}` as `usePurchase`, under the shop's scope. */
export function useSellerOrder(
	shopId: string | undefined,
	orderId: string | undefined,
) {
	return useQuery({
		queryKey: shopOrderKey(shopId ?? "", orderId ?? ""),
		queryFn: () => api.get<OrderView>(`/api/orders/${orderId}`),
		enabled: Boolean(shopId) && Boolean(orderId),
	});
}
