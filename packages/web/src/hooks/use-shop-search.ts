"use client";

import { useQuery } from "@tanstack/react-query";
import { shopApi } from "~/lib/shop-api";
import type { ShopSearchResponse } from "~/types";

export interface ShopSearchParams {
	q: string;
	city: string;
	limit: number;
}

export const shopSearchKey = (params: ShopSearchParams) =>
	["shops", "search", params] as const;

/** Active shops matching the query and city, for the search page's Shops tab. */
export function useShopSearch(params: ShopSearchParams) {
	return useQuery<ShopSearchResponse>({
		queryKey: shopSearchKey(params),
		queryFn: () =>
			shopApi.searchShops({
				q: params.q || undefined,
				city: params.city || undefined,
				limit: params.limit,
			}),
		retry: false,
	});
}
