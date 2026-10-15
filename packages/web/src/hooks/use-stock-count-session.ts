"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { shopApi } from "~/lib/shop-api";
import type { StockCountOverview, StockCountSessionView } from "~/types";

export const stockCountOverviewKey = (shopId: string) =>
	["shops", shopId, "stock-count-sessions"] as const;

/** The open count (if any), the last finished one's date and the shop's locations. */
export function useStockCountOverview(shopId: string) {
	return useQuery<StockCountOverview>({
		queryKey: stockCountOverviewKey(shopId),
		queryFn: () => shopApi.stockCountOverview(shopId),
		retry: false,
	});
}

export function useStartStockCount(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<
		StockCountSessionView,
		ApiError,
		{ locationId?: string | null }
	>({
		mutationKey: ["shops", shopId, "stock-count-sessions", "start"],
		mutationFn: (body) => shopApi.startStockCount(shopId, body),
		retry: false,
		onSuccess: (session) => {
			queryClient.setQueryData<StockCountOverview>(
				stockCountOverviewKey(shopId),
				(previous) =>
					previous
						? { ...previous, session }
						: { session, lastCompletedAt: null, locations: [] },
			);
		},
	});
}

export function useSaveStockCountProgress(shopId: string) {
	return useMutation<
		StockCountSessionView,
		ApiError,
		{
			sessionId: string;
			counts: Record<string, string>;
			locationId?: string | null;
		}
	>({
		mutationKey: ["shops", shopId, "stock-count-sessions", "progress"],
		mutationFn: ({ sessionId, ...body }) =>
			shopApi.saveStockCountProgress(shopId, sessionId, body),
		retry: false,
	});
}
