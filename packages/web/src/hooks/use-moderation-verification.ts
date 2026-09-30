"use client";

import {
	type UseMutationResult,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { moderationVerificationKeys } from "~/lib/query-keys";
import { apiGet, apiPost, query } from "~/lib/shop-api";
import type {
	ReviewerQueueResponse,
	ReviewerRequestDetail,
	ReviewSignalCode,
	SignedDocumentUrl,
} from "~/lib/verification";
import type { VerificationRequest } from "../../../api/src/payload-types";

export { moderationVerificationKeys };

export type ModerationQueue = "to_review" | "mine" | "needs_info" | "decided";

export interface VerificationQueueFilters {
	level?: 2 | 3;
	signal?: ReviewSignalCode;
}

/** The reviewer queue. Never gated by the verification feature flag: a review already in flight must finish while intake is paused. */
export function useVerificationQueue(
	queue: ModerationQueue,
	filters: VerificationQueueFilters = {},
) {
	return useQuery<ReviewerQueueResponse, ApiError>({
		queryKey: moderationVerificationKeys.queue(queue, filters),
		queryFn: () =>
			apiGet<ReviewerQueueResponse>(
				`/api/moderation/verification${query({ queue, ...filters })}`,
			),
		retry: false,
	});
}

/** One request's full reviewer detail: the seller's answers, documents metadata, prior decisions and what this viewer may do. */
export function useVerificationRequest(id: string | null) {
	return useQuery<ReviewerRequestDetail, ApiError>({
		queryKey: moderationVerificationKeys.detail(id ?? ""),
		enabled: Boolean(id),
		queryFn: () =>
			apiGet<ReviewerRequestDetail>(`/api/moderation/verification/${id}`),
		retry: false,
	});
}

export type VerificationDecisionAction =
	| { action: "claim"; force?: boolean }
	| { action: "release" }
	| { action: "request_info"; reasonCode: string; sellerMessage: string }
	| {
			action: "approve";
			note?: string | null;
			checklist?: Record<string, boolean>;
	  }
	| {
			action: "reject";
			reasonCode: string;
			sellerMessage: string;
			note?: string | null;
	  }
	| { action: "revoke"; reasonCode: string; note?: string | null };

export interface VerificationDecisionVariables {
	requestId: string;
	body: VerificationDecisionAction;
}

/**
 * Every reviewer action on a request — claim, release, request info, approve,
 * reject, revoke — goes through this one mutation, dispatched by `body.action`
 * the same way the route itself dispatches. Invalidates the queue and the
 * summary (its pending count) alongside the request's own detail: a decision
 * changes which queue a request belongs to, not just its own fields.
 */
export function useVerificationDecision(): UseMutationResult<
	VerificationRequest,
	ApiError,
	VerificationDecisionVariables
> {
	const queryClient = useQueryClient();
	return useMutation<
		VerificationRequest,
		ApiError,
		VerificationDecisionVariables
	>({
		mutationKey: [...moderationVerificationKeys.root, "decision"],
		mutationFn: ({ requestId, body }) =>
			apiPost<{ request: VerificationRequest }>(
				`/api/moderation/verification/${requestId}`,
				body,
			).then((result) => result.request),
		retry: false,
		onSuccess: (_result, { requestId }) => {
			void queryClient.invalidateQueries({
				queryKey: moderationVerificationKeys.root,
			});
			void queryClient.invalidateQueries({
				queryKey: moderationVerificationKeys.summary,
			});
			void queryClient.invalidateQueries({
				queryKey: moderationVerificationKeys.detail(requestId),
			});
		},
	});
}

/**
 * Mints a logged, 60-second signed URL to view one identity document. A
 * mutation, not a query: opening the document is the auditable event, so it
 * must run only on an explicit click and never be replayed by a refetch.
 */
export function useDocumentUrl(): UseMutationResult<
	SignedDocumentUrl,
	ApiError,
	string
> {
	return useMutation<SignedDocumentUrl, ApiError, string>({
		mutationKey: [...moderationVerificationKeys.root, "document-url"],
		mutationFn: (docId) =>
			apiPost<SignedDocumentUrl>(
				`/api/moderation/verification/documents/${docId}/view`,
			),
		retry: false,
	});
}
