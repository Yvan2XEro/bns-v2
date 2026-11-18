import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	PurchaseOrderAction,
	PurchaseOrderPage,
	PurchaseOrderView,
} from "../../../api/src/contracts/purchaseOrders";
import { api } from "../lib/api";

export interface PurchaseOrderFilters {
	side: "supplier" | "reseller";
	status?: PurchaseOrderView["status"];
	q?: string;
	from?: string;
}

export const purchaseOrdersRootKey = (shopId: string) =>
	["shops", shopId, "purchase-orders"] as const;

export const purchaseOrdersKey = (
	shopId: string,
	filters: PurchaseOrderFilters,
) => [...purchaseOrdersRootKey(shopId), filters] as const;

export const purchaseOrderKey = (shopId: string, purchaseOrderId: string) =>
	[...purchaseOrdersRootKey(shopId), purchaseOrderId] as const;

function purchaseOrderQuery(
	filters: PurchaseOrderFilters,
	page: number,
): string {
	const search = new URLSearchParams({
		side: filters.side,
		page: String(page),
	});
	if (filters.status) search.set("status", filters.status);
	if (filters.q) search.set("q", filters.q);
	if (filters.from) search.set("from", filters.from);
	return search.toString();
}

export function useShopPurchaseOrders(
	shopId: string | undefined,
	filters: PurchaseOrderFilters,
) {
	return useInfiniteQuery({
		queryKey: purchaseOrdersKey(shopId ?? "", filters),
		queryFn: ({ pageParam }) =>
			api.get<PurchaseOrderPage>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/purchase-orders?${purchaseOrderQuery(filters, pageParam)}`,
			),
		initialPageParam: 1,
		getNextPageParam: (last) =>
			last.page < last.totalPages ? last.page + 1 : undefined,
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function usePurchaseOrder(
	shopId: string | undefined,
	purchaseOrderId: string | undefined,
) {
	return useQuery({
		queryKey: purchaseOrderKey(shopId ?? "", purchaseOrderId ?? ""),
		queryFn: () =>
			api.get<PurchaseOrderView>(
				`/api/purchase-orders/${encodeURIComponent(purchaseOrderId ?? "")}`,
			),
		enabled: Boolean(shopId && purchaseOrderId),
		retry: false,
	});
}

export function usePurchaseOrderAction(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<PurchaseOrderView, Error, PurchaseOrderAction>({
		mutationFn: ({ purchaseOrderId, action, ...input }) =>
			api.post<PurchaseOrderView>(
				`/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}/${action}`,
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
