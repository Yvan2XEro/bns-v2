"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
	type ShopAdFilter,
	type ShopAdsResponse,
	shopApi,
} from "~/lib/shop-api";

/** Every view of one shop's ads, so closing or renewing one drops them all. */
export const shopAdsRootKey = (shopId: string) =>
	["shops", shopId, "ads"] as const;

export const shopAdsKey = (
	shopId: string,
	params: { filter: ShopAdFilter; page: number },
) => [...shopAdsRootKey(shopId), params] as const;

/** One page of the shop's ads that are not products. */
export function useShopAds(
	shopId: string,
	params: { filter: ShopAdFilter; page: number },
) {
	return useQuery<ShopAdsResponse>({
		queryKey: shopAdsKey(shopId, params),
		queryFn: () => shopApi.listAds(shopId, params),
		placeholderData: keepPreviousData,
		retry: false,
	});
}
