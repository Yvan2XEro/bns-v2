"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { billingKey } from "~/lib/query-keys";
import { apiGet, apiPost } from "~/lib/shop-api";
import type { BillingView } from "~/types/order";

export { billingKey };

/**
 * The shop's commission invoices, the accrual for the week in progress and
 * the restriction, if any. Owner and manager only, server-side
 * (`payments.view`); a staff member gets `shop.forbidden` rather than an
 * empty page, which is the matrix's answer and not a question this hook asks.
 */
export function useBilling(shopId: string | null) {
	return useQuery<BillingView, ApiError>({
		queryKey: billingKey(shopId ?? ""),
		queryFn: () =>
			apiGet<BillingView>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/billing`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

export const payInvoiceKey = ["commission-invoices", "pay"] as const;

/**
 * Opens a payment intent for one invoice and answers the provider's
 * `checkoutUrl`, which the screen opens in a new tab. The invoice becomes
 * `paid` on the provider's webhook, not here, so the billing view is
 * invalidated to pick that up on return rather than assumed settled.
 */
export function usePayInvoice(shopId: string | null) {
	const queryClient = useQueryClient();
	return useMutation<{ checkoutUrl: string }, ApiError, string>({
		mutationKey: [...payInvoiceKey, shopId ?? ""],
		mutationFn: (invoiceId) =>
			apiPost<{ checkoutUrl: string }>(
				`/api/commission-invoices/${encodeURIComponent(invoiceId)}/pay`,
			),
		retry: false,
		onSuccess: () => {
			if (!shopId) return;
			void queryClient.invalidateQueries({ queryKey: billingKey(shopId) });
		},
	});
}

/** The invoice's printable document; a `GET` returning HTML, so a link. */
export function invoiceDocumentUrl(invoiceId: string, lang: "fr" | "en") {
	return `/api/commission-invoices/${encodeURIComponent(invoiceId)}/document?lang=${lang}`;
}
