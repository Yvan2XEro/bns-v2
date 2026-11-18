"use client";

import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { type QueueFilters, queueQuery } from "~/lib/moderation-console";
import {
	caseKeys,
	moderationConsoleKeys,
	moderationVerificationKeys,
} from "~/lib/query-keys";
import { apiGet, apiPost } from "~/lib/shop-api";
import type {
	ModerationQueueNextResponse,
	ModerationQueueResponse,
	ModerationQueueType,
	ModerationSummary,
	RiskFlagClaimResponse,
} from "../../../api/src/contracts/moderationConsole";

export function useModerationSummary() {
	return useQuery<ModerationSummary, ApiError>({
		queryKey: moderationConsoleKeys.summary,
		queryFn: () => apiGet<ModerationSummary>("/api/moderation/summary"),
		retry: false,
		refetchInterval: 60_000,
	});
}

/** Filters are normalised so `{}` and `{ type: undefined }` share one cache entry. */
export function useModerationQueue(filters: QueueFilters) {
	const key = {
		...(filters.type ? { type: filters.type } : {}),
		...(filters.mine ? { mine: true } : {}),
	};
	return useInfiniteQuery<
		ModerationQueueResponse,
		ApiError,
		InfiniteData<ModerationQueueResponse>,
		ReturnType<typeof moderationConsoleKeys.queue>,
		string | null
	>({
		queryKey: moderationConsoleKeys.queue(key),
		queryFn: ({ pageParam }) =>
			apiGet<ModerationQueueResponse>(
				`/api/moderation/queue${queueQuery(key, pageParam)}`,
			),
		initialPageParam: null,
		getNextPageParam: (last) => last.nextCursor,
		retry: false,
	});
}

export function useInvalidateModeration() {
	const client = useQueryClient();
	return () =>
		Promise.all([
			client.invalidateQueries({ queryKey: moderationConsoleKeys.root }),
			client.invalidateQueries({ queryKey: moderationVerificationKeys.root }),
			client.invalidateQueries({ queryKey: caseKeys.moderation }),
		]);
}

export function useTakeNextQueueItem() {
	const invalidate = useInvalidateModeration();
	return useMutation<
		ModerationQueueNextResponse,
		ApiError,
		ModerationQueueType | undefined
	>({
		mutationFn: (type) =>
			apiPost<ModerationQueueNextResponse>(
				"/api/moderation/queue/next",
				type ? { type } : {},
			),
		onSuccess: invalidate,
	});
}

export function useClaimRiskFlag() {
	const invalidate = useInvalidateModeration();
	return useMutation<RiskFlagClaimResponse, ApiError, string>({
		mutationFn: (id) =>
			apiPost<RiskFlagClaimResponse>(
				`/api/moderation/risk-flags/${encodeURIComponent(id)}/claim`,
			),
		onSuccess: invalidate,
	});
}
