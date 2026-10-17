"use client";

import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
} from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { type RiskTab, riskFlagsPath } from "~/lib/moderation-risk";
import { moderationConsoleKeys } from "~/lib/query-keys";
import { apiGet, apiPost } from "~/lib/shop-api";
import type {
	RiskFlagDecisionInput,
	RiskFlagDetail,
	RiskFlagQueuePage,
	RiskFlagStats,
} from "../../../api/src/contracts/moderationConsole";
import { useInvalidateModeration } from "./use-moderation-console";

export function useRiskFlags(tab: RiskTab) {
	return useInfiniteQuery<
		RiskFlagQueuePage,
		ApiError,
		InfiniteData<RiskFlagQueuePage>,
		ReturnType<typeof moderationConsoleKeys.riskFlags>,
		string | null
	>({
		queryKey: moderationConsoleKeys.riskFlags(tab),
		queryFn: ({ pageParam }) =>
			apiGet<RiskFlagQueuePage>(riskFlagsPath(tab, pageParam)),
		initialPageParam: null,
		getNextPageParam: (last) => (last.hasMore ? last.nextCursor : null),
		retry: false,
	});
}

export function useRiskFlag(id: string | null) {
	return useQuery<RiskFlagDetail, ApiError>({
		queryKey: moderationConsoleKeys.riskFlag(id ?? ""),
		queryFn: () =>
			apiGet<RiskFlagDetail>(
				`/api/moderation/risk-flags/${encodeURIComponent(id ?? "")}`,
			),
		enabled: Boolean(id),
		retry: false,
	});
}

export function useRiskStats() {
	return useQuery<RiskFlagStats, ApiError>({
		queryKey: moderationConsoleKeys.riskStats,
		queryFn: () => apiGet<RiskFlagStats>("/api/moderation/risk-flags/stats"),
		retry: false,
		refetchInterval: 60_000,
	});
}

export function useRiskDecision() {
	const invalidate = useInvalidateModeration();
	return useMutation<
		{ id: string; status: string },
		ApiError,
		{ id: string; body: RiskFlagDecisionInput }
	>({
		mutationFn: ({ id, body }) =>
			apiPost(`/api/moderation/risk-flags/${encodeURIComponent(id)}`, body),
		onSuccess: invalidate,
	});
}
