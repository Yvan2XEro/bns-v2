"use client";

import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import type { OrderStatusName } from "~/lib/order-status";
import {
	feeInvoiceKey,
	purchaseKey,
	purchasesKey,
	purchasesRootKey,
} from "~/lib/query-keys";
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

/**
 * The order's own buyer-fee invoice id, read through the collection's own
 * read access (the buyer, or staff) rather than a dedicated route — Payload
 * already serves `GET /api/buyer-fee-invoices` with that rule. Null, not an
 * error, for an order that never carried a protection fee (COD, or no
 * invoice issued yet).
 */
export function useFeeInvoiceId(orderId: string | null) {
	return useQuery<string | null, ApiError>({
		queryKey: feeInvoiceKey(orderId ?? ""),
		queryFn: async () => {
			const page = await apiGet<{ docs: Array<{ id: string }> }>(
				`/api/buyer-fee-invoices?where[order][equals]=${encodeURIComponent(orderId ?? "")}&where[kind][equals]=invoice&limit=1&depth=0`,
			);
			return page.docs[0]?.id ?? null;
		},
		enabled: Boolean(orderId),
		retry: false,
	});
}

export interface FeeInvoiceDownload {
	url: string;
	expiresAt: string;
}

/**
 * Mints a 5-minute signed URL to the invoice PDF. A mutation, not a query,
 * the same reasoning as `useDocumentUrl`: opening the file is a deliberate
 * click, never prefetched or replayed by a refetch.
 */
export function useFeeInvoiceDownload() {
	return useMutation<FeeInvoiceDownload, ApiError, string>({
		mutationKey: [...purchasesRootKey(), "fee-invoice", "download"],
		mutationFn: (invoiceId) =>
			apiGet<FeeInvoiceDownload>(
				`/api/buyer-fee-invoices/${encodeURIComponent(invoiceId)}/download`,
			),
		retry: false,
	});
}
