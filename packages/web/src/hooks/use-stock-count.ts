"use client";

import {
	type UseMutationResult,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { catalogueRootKey } from "~/hooks/use-catalogue";
import { myShopKey } from "~/hooks/use-my-shop";
import {
	movementsRootKey,
	shopVariantsKey,
	stockSummaryKey,
} from "~/hooks/use-stock";
import type { ApiError } from "~/lib/apiError";
import { shopApi } from "~/lib/shop-api";
import type { StockCountResult } from "~/types";

export interface StockCountVariables {
	counts: { variantId: string; counted: number }[];
	note?: string;
}

/**
 * Posts a physical count. Each line is the same conditional write a manual
 * adjustment uses, so the server can refuse a line whose stock moved since
 * the count screen loaded (a race, or units reserved in the meantime); that
 * refusal is the truth, so it is shown instead of being retried.
 */
export function useStockCount(
	shopId: string,
): UseMutationResult<StockCountResult, ApiError, StockCountVariables> {
	const queryClient = useQueryClient();

	return useMutation<StockCountResult, ApiError, StockCountVariables>({
		mutationKey: ["shops", shopId, "stock-counts"],
		mutationFn: (variables) => shopApi.stockCounts(shopId, variables),
		retry: false,
		onSuccess: () => {
			for (const queryKey of [
				movementsRootKey(shopId),
				stockSummaryKey(shopId),
				shopVariantsKey(shopId),
				catalogueRootKey(shopId),
				myShopKey,
			]) {
				void queryClient.invalidateQueries({ queryKey });
			}
		},
	});
}
