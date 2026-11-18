import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { OrderPage, OrderStatusName, OrderView } from "../types/order";

/** `cursor` stays out of the key, same as every other paginated key here. */
export interface PurchaseFilters {
	status?: OrderStatusName;
}

/**
 * Deliberately not nested under a shop scope: a buyer's purchases span every
 * shop they have ordered from, so invalidating one shop must not drop them.
 * The detail key sits under the same root, so one order's mutation can drop
 * the list and the detail together.
 */
export const purchasesRootKey = ["purchases"] as const;

export const purchasesKey = (filters: PurchaseFilters = {}) =>
	["purchases", "list", filters] as const;

export const purchaseKey = (orderId: string) =>
	["purchases", "detail", orderId] as const;

/** 20 rows a page, keyset-paginated on `createdAt` (`ORDER_LIST_PAGE_SIZE`). */
export function usePurchases(filters: PurchaseFilters = {}) {
	const { user } = useAuth();
	return useInfiniteQuery({
		queryKey: purchasesKey(filters),
		queryFn: ({ pageParam }: { pageParam: string | undefined }) => {
			const search = new URLSearchParams({ role: "buyer" });
			if (filters.status) search.set("status", filters.status);
			if (pageParam) search.set("cursor", pageParam);
			return api.get<OrderPage>(`/api/orders?${search.toString()}`);
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		enabled: Boolean(user),
	});
}

/**
 * `GET /api/orders/{id}` projects for whichever audience the caller turns out
 * to be, so this one route backs both this hook and `useSellerOrder`; the two
 * keys differ because the two screens are reached differently, not because the
 * payload does.
 */
export function usePurchase(orderId: string | undefined) {
	return useQuery({
		queryKey: purchaseKey(orderId ?? ""),
		queryFn: () => api.get<OrderView>(`/api/orders/${orderId}`),
		enabled: Boolean(orderId),
	});
}

/**
 * The printable receipt, as markup. `text/html` behind the caller's token, so
 * it cannot be opened by URL in a browser — a screen renders the string in a
 * WebView. Fetched on demand (`enabled`), never with the order.
 */
export function useOrderReceipt(
	orderId: string | undefined,
	lang: "fr" | "en",
	enabled = false,
) {
	return useQuery({
		queryKey: [...purchaseKey(orderId ?? ""), "receipt", lang] as const,
		queryFn: () => api.getText(`/api/orders/${orderId}/receipt?lang=${lang}`),
		enabled: Boolean(orderId) && enabled,
		staleTime: Number.POSITIVE_INFINITY,
	});
}
