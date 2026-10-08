"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import {
	type DisputeQueueFilters,
	queueQuery,
} from "~/lib/moderation-disputes";
import { caseKeys } from "~/lib/query-keys";
import { apiGet, apiPost } from "~/lib/shop-api";
import type {
	DisputeOutcomeInput,
	DisputeOutcomePreview,
	ModerationDisputeRow,
	ModerationDisputeSheet,
} from "../../../api/src/contracts/disputes";

export type ModerationDisputeAction =
	| { action: "assign" }
	| { action: "request_info"; from: "buyer" | "seller"; message: string }
	| ({ action: "resolve"; note: string } & DisputeOutcomeInput);

export function useModerationDisputes(filters: DisputeQueueFilters) {
	return useQuery<ModerationDisputeRow[], ApiError>({
		queryKey: [...caseKeys.moderation, "queue", filters],
		queryFn: () =>
			apiGet<ModerationDisputeRow[]>(
				`/api/moderation/disputes${queueQuery(filters)}`,
			),
		retry: false,
	});
}

export function useModerationDispute(id: string) {
	return useQuery<ModerationDisputeSheet, ApiError>({
		queryKey: caseKeys.moderationDetail(id),
		queryFn: () =>
			apiGet<ModerationDisputeSheet>(
				`/api/moderation/disputes/${encodeURIComponent(id)}`,
			),
		retry: false,
	});
}

export function useModerationDisputeAction(id: string) {
	const client = useQueryClient();
	return useMutation<unknown, ApiError, ModerationDisputeAction>({
		mutationFn: (input) =>
			apiPost(`/api/moderation/disputes/${encodeURIComponent(id)}`, input),
		onSuccess: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey: caseKeys.moderation }),
				client.invalidateQueries({ queryKey: caseKeys.disputes }),
			]);
		},
	});
}

/** The only source of the breakdown the confirmation shows. */
export function usePreviewDisputeOutcome(id: string) {
	return useMutation<DisputeOutcomePreview, ApiError, number>({
		mutationFn: (refundAmount) =>
			apiPost<DisputeOutcomePreview>(
				`/api/moderation/disputes/${encodeURIComponent(id)}`,
				{ action: "preview", refundAmount },
			),
		retry: false,
	});
}

export interface SignedEvidenceUrl {
	url: string;
	expiresAt: string;
	mimeType: string;
}

/** Each call is a logged view, so it runs on a click only. */
export function useEvidenceUrl(disputeId: string) {
	return useMutation<SignedEvidenceUrl, ApiError, string>({
		mutationFn: (evidenceId) =>
			apiPost<SignedEvidenceUrl>(
				`/api/disputes/${encodeURIComponent(disputeId)}/evidence/${encodeURIComponent(evidenceId)}/url`,
			),
		retry: false,
	});
}
