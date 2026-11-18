import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ReviewerAction } from "../lib/verification";
import type {
	ModerationVerificationDetail,
	ModerationVerificationQueue,
	ModerationVerificationQueueResponse,
	SignedDocumentUrl,
	VerificationStatus,
} from "../types/api";
import { moderationKeys, useIsModerator } from "./useModeration";

/** Nested under `moderationKeys` so the hub's existing invalidations (summary, listings, reports) reach it. */
export const moderationVerificationKeys = {
	root: ["moderation", "verification"] as const,
	queue: (queue: string) =>
		["moderation", "verification", "queue", queue] as const,
	detail: (id: string) => ["moderation", "verification", "detail", id] as const,
};

export interface VerificationQueueFilters {
	level?: 2 | 3;
	signal?: string;
}

function queryString(
	queue: ModerationVerificationQueue,
	filters: VerificationQueueFilters,
): string {
	const params = new URLSearchParams({ queue });
	if (filters.level) params.set("level", String(filters.level));
	if (filters.signal) params.set("signal", filters.signal);
	return params.toString();
}

/** Reviewer queue is never gated on `verificationEnabled`: a reviewer finishes in-flight work whatever the flag says. */
export function useVerificationQueue(
	queue: ModerationVerificationQueue,
	filters: VerificationQueueFilters = {},
) {
	const enabled = useIsModerator();
	return useQuery({
		queryKey: [...moderationVerificationKeys.queue(queue), filters],
		queryFn: () =>
			api.get<ModerationVerificationQueueResponse>(
				`/api/moderation/verification?${queryString(queue, filters)}`,
			),
		enabled,
	});
}

export function useVerificationRequest(id: string | undefined) {
	const enabled = useIsModerator();
	return useQuery({
		queryKey: moderationVerificationKeys.detail(id ?? ""),
		queryFn: () =>
			api.get<ModerationVerificationDetail>(
				`/api/moderation/verification/${id}`,
			),
		enabled: Boolean(id) && enabled,
	});
}

export interface VerificationDecisionInput {
	id: string;
	action: ReviewerAction;
	force?: boolean;
	reasonCode?: string;
	sellerMessage?: string;
	note?: string;
	checklist?: Record<string, boolean>;
}

/**
 * The server's own doc after the write — only `id` and `status` are typed
 * here, because the route answers with the raw collection row (`services/
 * verification.ts`'s return value), not the curated `ModerationVerificationDetail`
 * shape. Screens refetch `useVerificationRequest` for the full picture.
 */
export interface VerificationDecisionResult {
	request: { id: string; status: VerificationStatus };
}

export function useVerificationDecision() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, ...body }: VerificationDecisionInput) =>
			api.post<VerificationDecisionResult>(
				`/api/moderation/verification/${id}`,
				body,
			),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({
				queryKey: moderationVerificationKeys.detail(variables.id),
			});
			queryClient.invalidateQueries({
				queryKey: moderationVerificationKeys.root,
			});
			queryClient.invalidateQueries({ queryKey: moderationKeys.summary });
		},
	});
}

/**
 * Every open re-requests a fresh signed URL rather than reusing one: each
 * open is logged, and the URL itself expires in 60 seconds — caching it
 * across documents would outlive both.
 */
export function useDocumentUrl() {
	return useMutation({
		mutationFn: (documentId: string) =>
			api.post<SignedDocumentUrl>(
				`/api/moderation/verification/documents/${documentId}/view`,
				{},
			),
	});
}
