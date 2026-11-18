"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import {
	paymentSetupKey,
	sellerPaymentsKey,
	sellerPaymentsRootKey,
	sellerPayoutKey,
} from "~/lib/query-keys";
import { apiGet, apiPost, query } from "~/lib/shop-api";
import type {
	PaymentSetupView,
	PayoutAccountView,
	SellerPaymentsView,
	SellerPayoutDetail,
} from "~/types/payments";

export {
	paymentSetupKey,
	sellerPaymentsKey,
	sellerPaymentsRootKey,
	sellerPayoutKey,
} from "~/lib/query-keys";

/** The amounts strip, payouts list and per-order breakdown. Owner, manager
 * and staff through `payments.view`, server-side. */
export function useSellerPayments(shopId: string | null) {
	return useQuery<SellerPaymentsView, ApiError>({
		queryKey: sellerPaymentsKey(shopId ?? ""),
		queryFn: () =>
			apiGet<SellerPaymentsView>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/payments`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

/** One payout's orders and status history. */
export function useSellerPayout(
	shopId: string | null,
	payoutId: string | null,
) {
	return useQuery<SellerPayoutDetail, ApiError>({
		queryKey: sellerPayoutKey(shopId ?? "", payoutId ?? ""),
		queryFn: () =>
			apiGet<SellerPayoutDetail>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/payments/payouts/${encodeURIComponent(payoutId ?? "")}`,
			),
		enabled: Boolean(shopId && payoutId),
		retry: false,
	});
}

/**
 * The setup/onboarding view. `onboardingDone` forwards `?onboarding=done` —
 * the SMS/hosted-onboarding return — which is what queues the connected
 * account's re-sync server-side; it is read once from the URL by the caller
 * and is not state this hook owns.
 */
export function usePaymentSetup(
	shopId: string | null,
	options: { onboardingDone?: boolean } = {},
) {
	return useQuery<PaymentSetupView, ApiError>({
		queryKey: paymentSetupKey(shopId ?? ""),
		queryFn: () =>
			apiGet<PaymentSetupView>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/payments/setup${query({
					onboarding: options.onboardingDone ? "done" : undefined,
				})}`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

/** A fresh hosted-onboarding link, every call — the screen opens it directly. */
export function useStartOnboarding(shopId: string | null) {
	return useMutation<{ url: string }, ApiError, void>({
		mutationKey: [...sellerPaymentsRootKey(shopId ?? ""), "onboarding"],
		mutationFn: () =>
			apiPost<{ url: string }>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/payments/onboarding`,
				{ platform: "web" },
			),
		retry: false,
	});
}

export interface SubmitPayoutAccountInput {
	method: "mtn_momo" | "orange_money" | "bank";
	accountName: string;
	accountNumber: string;
}

/** Adds or replaces the shop's payout account. Refuses with
 * `payout.holdActive` or `payout.accountChangeCooldown` (`details.until`)
 * when a change is not allowed right now. */
export function useSubmitPayoutAccount(shopId: string | null) {
	const queryClient = useQueryClient();
	return useMutation<PayoutAccountView, ApiError, SubmitPayoutAccountInput>({
		mutationKey: [...sellerPaymentsRootKey(shopId ?? ""), "payout-account"],
		mutationFn: (input) =>
			apiPost<PayoutAccountView>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/payout-accounts`,
				input,
			),
		retry: false,
		onSuccess: () => {
			if (!shopId) return;
			void queryClient.invalidateQueries({
				queryKey: sellerPaymentsRootKey(shopId),
			});
		},
	});
}

/**
 * "This was not me" — the SMS link's target. The caller fires this
 * explicitly, from a confirm button; it must never run on its own just
 * because the page loaded with `?notMe=` in the URL (an SMS preview would
 * trigger it otherwise).
 */
export function useReportPayoutAccountNotMe(shopId: string | null) {
	const queryClient = useQueryClient();
	return useMutation<PayoutAccountView, ApiError, string>({
		mutationKey: [...sellerPaymentsRootKey(shopId ?? ""), "not-me"],
		mutationFn: (accountId) =>
			apiPost<PayoutAccountView>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/payout-accounts/${encodeURIComponent(accountId)}/not-me`,
			),
		retry: false,
		onSuccess: () => {
			if (!shopId) return;
			void queryClient.invalidateQueries({
				queryKey: sellerPaymentsRootKey(shopId),
			});
		},
	});
}
