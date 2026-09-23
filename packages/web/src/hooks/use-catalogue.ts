"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { shopApi } from "~/lib/shop-api";
import type { CatalogueResponse } from "~/types";

export interface CatalogueParams {
	status?: string;
	stock?: "low" | "out";
	q?: string;
	page: number;
	limit: number;
}

/** Every page and filter of one shop's catalogue, so a product write drops them all. */
export const catalogueRootKey = (shopId: string) =>
	["shops", shopId, "products"] as const;

export const catalogueKey = (shopId: string, params: CatalogueParams) =>
	[...catalogueRootKey(shopId), params] as const;

/**
 * One page of the shop catalogue. The server paginates and counts, so the hook
 * asks for exactly the rows the table renders and nothing more.
 */
export function useCatalogue(shopId: string, params: CatalogueParams) {
	return useQuery<CatalogueResponse>({
		queryKey: catalogueKey(shopId, params),
		queryFn: () => shopApi.listProducts(shopId, params),
		// Keeps the table and its counts on screen while the next page loads.
		placeholderData: keepPreviousData,
		retry: false,
	});
}
