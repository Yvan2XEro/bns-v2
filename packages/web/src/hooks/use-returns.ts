"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { caseKeys } from "~/lib/query-keys";
import {
	type JsonReturnAction,
	returnActionRequest,
} from "~/lib/return-actions";
import { apiGet, apiPost, apiPostForm, query } from "~/lib/shop-api";
import type {
	OpenWithdrawalInput,
	ReturnCaseListPage,
	ReturnCaseStatus,
	ReturnCaseView,
} from "../../../api/src/contracts/returns";

export { caseKeys };

type ReturnList = ReturnCaseListPage;

export interface ReturnFilters {
	status?: ReturnCaseStatus;
	overdue?: boolean;
}

function returnQuery(filters: ReturnFilters) {
	return query({
		status: filters.status,
		overdue: filters.overdue ? "true" : undefined,
	});
}

export function useBuyerReturns(filters: ReturnFilters = {}) {
	return useQuery<ReturnList, ApiError>({
		queryKey: caseKeys.returnList("buyer", "me", {
			status: filters.status,
			overdue: filters.overdue,
		}),
		queryFn: () => apiGet<ReturnList>(`/api/me/returns${returnQuery(filters)}`),
		retry: false,
	});
}

export function useSellerReturns(
	shopId: string | null,
	filters: ReturnFilters = {},
) {
	return useQuery<ReturnList, ApiError>({
		queryKey: caseKeys.returnList("shop", shopId ?? "", {
			status: filters.status,
			overdue: filters.overdue,
		}),
		queryFn: () =>
			apiGet<ReturnList>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/returns${returnQuery(filters)}`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function useReturnCase(caseId: string | null) {
	return useQuery<ReturnCaseView, ApiError>({
		queryKey: caseKeys.returnDetail(caseId ?? ""),
		queryFn: () =>
			apiGet<ReturnCaseView>(
				`/api/returns/${encodeURIComponent(caseId ?? "")}`,
			),
		enabled: Boolean(caseId),
		retry: false,
	});
}

export function useOpenReturn() {
	const queryClient = useQueryClient();
	return useMutation<
		{ caseNumber: string; caseId: string },
		ApiError,
		{ orderId: string; input: OpenWithdrawalInput }
	>({
		mutationFn: ({ orderId, input }) =>
			apiPost(`/api/orders/${encodeURIComponent(orderId)}/returns`, input),
		onSuccess: async () =>
			queryClient.invalidateQueries({ queryKey: caseKeys.returns }),
	});
}

export function useReturnAction() {
	const queryClient = useQueryClient();
	return useMutation<
		unknown,
		ApiError,
		{ caseId: string; action: JsonReturnAction; body?: unknown }
	>({
		mutationFn: ({ caseId, action, body }) => {
			const request = returnActionRequest(action, body);
			return apiPost(
				`/api/returns/${encodeURIComponent(caseId)}/${request.endpoint}`,
				request.body,
			);
		},
		onSuccess: async (_result, { caseId }) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: caseKeys.returns }),
				queryClient.invalidateQueries({
					queryKey: caseKeys.returnDetail(caseId),
				}),
			]);
		},
	});
}

export function useUploadReturnEvidence(caseId: string) {
	const client = useQueryClient();
	return useMutation<{ id: string }, ApiError, { file: File; kind: "photo" | "payment_proof" }>({
		mutationFn: ({ file, kind }) => {
			const form = new FormData();
			form.append("file", file);
			form.append("kind", kind);
			return apiPostForm(
				`/api/returns/${encodeURIComponent(caseId)}/evidence`,
				form,
			);
		},
		onSuccess: async () =>
			client.invalidateQueries({ queryKey: caseKeys.returnDetail(caseId) }),
	});
}
