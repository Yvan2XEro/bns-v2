"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type PopulatedVariant, shopApi } from "~/lib/shop-api";
import type { ClientMovementType, MovementPage, StockSummary } from "~/types";

export interface MovementsParams {
	type?: ClientMovementType;
	page: number;
	limit: number;
}

export const stockSummaryKey = (shopId: string) =>
	["shops", shopId, "stock-summary"] as const;

/** Every page and filter of one shop's ledger, so a movement drops them all. */
export const movementsRootKey = (shopId: string) =>
	["shops", shopId, "stock-movements"] as const;

export const movementsKey = (shopId: string, params: MovementsParams) =>
	[...movementsRootKey(shopId), params] as const;

export const shopVariantsKey = (shopId: string) =>
	["shops", shopId, "variants"] as const;

/**
 * The counters the ledger keeps up to date. It exposes the purchase cost, so
 * the API answers it to owners and managers only and the page asks for it only
 * when the member may see it.
 */
export function useStockSummary(shopId: string, enabled: boolean) {
	return useQuery<StockSummary>({
		queryKey: stockSummaryKey(shopId),
		queryFn: () => shopApi.stockSummary(shopId),
		enabled,
		retry: false,
	});
}

export function useMovements(shopId: string, params: MovementsParams) {
	return useQuery<MovementPage>({
		queryKey: movementsKey(shopId, params),
		queryFn: () =>
			shopApi.listMovements(shopId, {
				type: params.type,
				page: params.page,
				limit: params.limit,
			}),
		// Keeps the history on screen while the next page or filter loads.
		placeholderData: keepPreviousData,
		retry: false,
	});
}

/** Every non-archived variant of the shop, product populated, for the count screen. */
export function useShopVariants(shopId: string) {
	return useQuery<{ docs: PopulatedVariant[] }>({
		queryKey: shopVariantsKey(shopId),
		queryFn: () => shopApi.shopVariants(shopId),
		retry: false,
	});
}
