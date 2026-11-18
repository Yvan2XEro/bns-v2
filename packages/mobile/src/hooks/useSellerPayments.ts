import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type {
	PaymentSetupView,
	SellerPaymentsView,
	SellerPayoutDetail,
} from "../types/order";

/**
 * The onboarding return deep link — matches `onboardingUrls("mobile")` on
 * the API exactly; the provider redirects here to close the in-app browser,
 * so `openAuthSessionAsync`'s second argument must be this literal string.
 */
export const PAYMENTS_ONBOARDING_RETURN_URL =
	"buynsellem://seller/payments/setup";

export const sellerPaymentsKeys = {
	view: (shopId: string) => ["shops", shopId, "payments"] as const,
	setup: (shopId: string) => ["shops", shopId, "payments", "setup"] as const,
	payout: (shopId: string, payoutId: string) =>
		["shops", shopId, "payments", "payouts", payoutId] as const,
};

/** `GET /api/shops/{id}/payments`: the hub's amounts, payouts, orders and holds. */
export function useSellerPayments(shopId: string | undefined) {
	return useQuery({
		queryKey: sellerPaymentsKeys.view(shopId ?? ""),
		queryFn: () => api.get<SellerPaymentsView>(`/api/shops/${shopId}/payments`),
		enabled: Boolean(shopId),
	});
}

/** `GET /api/shops/{id}/payments/payouts/{payoutId}`. */
export function useSellerPayout(
	shopId: string | undefined,
	payoutId: string | undefined,
) {
	return useQuery({
		queryKey: sellerPaymentsKeys.payout(shopId ?? "", payoutId ?? ""),
		queryFn: () =>
			api.get<SellerPayoutDetail>(
				`/api/shops/${shopId}/payments/payouts/${payoutId}`,
			),
		enabled: Boolean(shopId) && Boolean(payoutId),
	});
}

/** `GET /api/shops/{id}/payments/setup`. */
export function useSellerPaymentSetup(shopId: string | undefined) {
	return useQuery({
		queryKey: sellerPaymentsKeys.setup(shopId ?? ""),
		queryFn: () =>
			api.get<PaymentSetupView>(`/api/shops/${shopId}/payments/setup`),
		enabled: Boolean(shopId),
	});
}

/**
 * The one-shot call made on the onboarding browser session's return, carrying
 * `?onboarding=done` so the API queues `syncConnectedAccount` — then seeds
 * the plain setup query with the fresh view, so the screen never shows a
 * second loading flash for data it already has.
 */
export function usePaymentSetupReturn(shopId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () =>
			api.get<PaymentSetupView>(
				`/api/shops/${shopId}/payments/setup?onboarding=done`,
			),
		onSuccess: (data) => {
			if (shopId) {
				queryClient.setQueryData(sellerPaymentsKeys.setup(shopId), data);
			}
		},
	});
}

/** `POST /api/shops/{id}/payments/onboarding`: a fresh hosted-onboarding link. */
export function useStartOnboarding(shopId: string | undefined) {
	return useMutation({
		mutationFn: () =>
			api.post<{ url: string }>(`/api/shops/${shopId}/payments/onboarding`, {
				platform: "mobile",
			}),
	});
}

export interface SubmitPayoutAccountInput {
	method: "mtn_momo" | "orange_money" | "bank";
	accountName: string;
	accountNumber: string;
}

/** `POST /api/shops/{id}/payout-accounts`. */
export function useSubmitPayoutAccount(shopId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: SubmitPayoutAccountInput) =>
			api.post(`/api/shops/${shopId}/payout-accounts`, input),
		onSuccess: () => {
			if (shopId) {
				queryClient.invalidateQueries({
					queryKey: sellerPaymentsKeys.setup(shopId),
				});
				queryClient.invalidateQueries({
					queryKey: sellerPaymentsKeys.view(shopId),
				});
			}
		},
	});
}

/**
 * `POST /api/shops/{id}/payout-accounts/{accountId}/not-me`. Called only from
 * behind an explicit confirm — never on page load, since the link reaches
 * the owner through an SMS/notification preview that must not trigger it.
 */
export function useReportPayoutAccountNotMe(shopId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (accountId: string) =>
			api.post(`/api/shops/${shopId}/payout-accounts/${accountId}/not-me`, {}),
		onSuccess: () => {
			if (shopId) {
				queryClient.invalidateQueries({
					queryKey: sellerPaymentsKeys.setup(shopId),
				});
			}
		},
	});
}
