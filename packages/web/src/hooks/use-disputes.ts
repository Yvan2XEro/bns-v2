"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import type { OpenDisputeFormInput } from "~/lib/dispute-problem";
import { caseKeys } from "~/lib/query-keys";
import { apiGet, apiPost } from "~/lib/shop-api";
import type {
	DisputeListPage,
	DisputeView,
} from "../../../api/src/contracts/disputes";

export function useBuyerDisputes() {
	return useQuery<DisputeListPage, ApiError>({
		queryKey: caseKeys.disputeList("buyer", "me"),
		queryFn: () => apiGet<DisputeListPage>("/api/me/disputes"),
		retry: false,
	});
}

export function useShopDisputes(shopId: string | null) {
	return useQuery<DisputeListPage, ApiError>({
		queryKey: caseKeys.disputeList("shop", shopId ?? ""),
		queryFn: () =>
			apiGet<DisputeListPage>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/disputes`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function useDispute(disputeId: string | null) {
	return useQuery<DisputeView, ApiError>({
		queryKey: caseKeys.disputeDetail(disputeId ?? ""),
		queryFn: () =>
			apiGet<DisputeView>(
				`/api/disputes/${encodeURIComponent(disputeId ?? "")}`,
			),
		enabled: Boolean(disputeId),
		retry: false,
	});
}

export function useDisputeAction(disputeId: string) {
	const client = useQueryClient();
	return useMutation<unknown, ApiError, { action: string; body?: unknown }>({
		mutationFn: ({ action, body }) => {
			const endpoint =
				action === "message"
					? "messages"
					: action === "proposal_accept" || action === "proposal_reject"
						? "proposal"
						: action === "respond_accept" ||
								action === "respond_propose" ||
								action === "respond_contest"
							? "respond"
							: action;
			return apiPost(
				`/api/disputes/${encodeURIComponent(disputeId)}/${endpoint}`,
				body,
			);
		},
		onSuccess: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey: caseKeys.disputes }),
				client.invalidateQueries({
					queryKey: caseKeys.disputeDetail(disputeId),
				}),
			]);
		},
	});
}

export function useOpenDispute(orderId: string) {
	const client = useQueryClient();
	return useMutation<
		{ id: string; number: string; status: string },
		ApiError,
		OpenDisputeFormInput
	>({
		mutationFn: (input) =>
			apiPost(`/api/orders/${encodeURIComponent(orderId)}/disputes`, input),
		onSuccess: async () =>
			client.invalidateQueries({ queryKey: caseKeys.disputes }),
	});
}
