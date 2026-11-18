import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { BillingView } from "../types/order";

/** Shop-scoped, so `useInvalidateShop` in `useShops.ts` already reaches it. */
export const billingKey = (shopId: string) =>
	["shops", shopId, "billing"] as const;

export const invoiceDocumentKey = (invoiceId: string, lang: "fr" | "en") =>
	["commission-invoices", invoiceId, "document", lang] as const;

/** Gated on `payments.view` server-side; the screen hides itself for a role
 * that lacks it rather than rendering an error. */
export function useBilling(shopId: string | undefined) {
	return useQuery({
		queryKey: billingKey(shopId ?? ""),
		queryFn: () => api.get<BillingView>(`/api/shops/${shopId}/billing`),
		enabled: Boolean(shopId),
	});
}

/**
 * Answers with the provider's hosted checkout URL rather than settling
 * anything: the invoice becomes `paid` on the provider's callback, so the
 * billing view is dropped on return, not here.
 */
export function usePayInvoice(shopId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (invoiceId: string) =>
			api.post<{ checkoutUrl: string }>(
				`/api/commission-invoices/${invoiceId}/pay`,
				{},
			),
		onSuccess: () => {
			if (shopId) {
				queryClient.invalidateQueries({ queryKey: billingKey(shopId) });
			}
		},
	});
}

/**
 * The invoice document, as markup — `text/html` behind the caller's token,
 * same as an order receipt, so a screen renders the string in a WebView
 * instead of opening a URL. Fetched on demand.
 */
export function useInvoiceDocument(
	invoiceId: string | undefined,
	lang: "fr" | "en",
	enabled = false,
) {
	return useQuery({
		queryKey: invoiceDocumentKey(invoiceId ?? "", lang),
		queryFn: () =>
			api.getText(
				`/api/commission-invoices/${invoiceId}/document?lang=${lang}`,
			),
		enabled: Boolean(invoiceId) && enabled,
		staleTime: Number.POSITIVE_INFINITY,
	});
}
