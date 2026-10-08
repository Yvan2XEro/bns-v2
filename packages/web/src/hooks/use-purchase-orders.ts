"use client";

import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import {
	purchaseOrderKey,
	purchaseOrdersKey,
	purchaseOrdersRootKey,
} from "~/lib/query-keys";
import { apiGet, apiPost, query } from "~/lib/shop-api";
import type {
	PurchaseOrderAction,
	PurchaseOrderPage,
	PurchaseOrderView,
} from "../../../api/src/contracts/purchaseOrders";

export {
	purchaseOrderKey,
	purchaseOrdersKey,
	purchaseOrdersRootKey,
} from "~/lib/query-keys";

export interface PurchaseOrderFilters {
	side: "supplier" | "reseller";
	status?: PurchaseOrderView["status"];
	q?: string;
	from?: string;
}

function purchaseOrderQuery(
	filters: PurchaseOrderFilters,
	page: number,
): string {
	return query({
		side: filters.side,
		status: filters.status,
		q: filters.q,
		from: filters.from,
		page: String(page),
	});
}

export function useShopPurchaseOrders(
	shopId: string | null,
	filters: PurchaseOrderFilters,
) {
	return useInfiniteQuery<
		PurchaseOrderPage,
		ApiError,
		InfiniteData<PurchaseOrderPage>,
		ReturnType<typeof purchaseOrdersKey>,
		number
	>({
		queryKey: purchaseOrdersKey(shopId ?? "", filters),
		queryFn: ({ pageParam }: { pageParam: number }) =>
			apiGet<PurchaseOrderPage>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/purchase-orders${purchaseOrderQuery(filters, pageParam)}`,
			),
		initialPageParam: 1,
		getNextPageParam: (last) =>
			last.page < last.totalPages ? last.page + 1 : undefined,
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function usePurchaseOrder(
	shopId: string | null,
	purchaseOrderId: string | null,
) {
	return useQuery<PurchaseOrderView, ApiError>({
		queryKey: purchaseOrderKey(shopId ?? "", purchaseOrderId ?? ""),
		queryFn: () =>
			apiGet<PurchaseOrderView>(
				`/api/purchase-orders/${encodeURIComponent(purchaseOrderId ?? "")}`,
			),
		enabled: Boolean(shopId && purchaseOrderId),
		retry: false,
	});
}

function actionPath(action: PurchaseOrderAction["action"]): string {
	return action;
}

export function usePurchaseOrderAction(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<PurchaseOrderView, ApiError, PurchaseOrderAction>({
		mutationFn: ({ purchaseOrderId, action, ...input }) =>
			apiPost<PurchaseOrderView>(
				`/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}/${actionPath(action)}`,
				"body" in input ? input.body : undefined,
			),
		onSuccess: async (_view, { purchaseOrderId }) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: purchaseOrdersRootKey(shopId),
				}),
				queryClient.invalidateQueries({
					queryKey: purchaseOrderKey(shopId, purchaseOrderId),
				}),
			]);
		},
	});
}
