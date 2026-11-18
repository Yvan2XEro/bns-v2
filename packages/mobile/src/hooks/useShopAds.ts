import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/src/lib/api";
import type { ListingDoc } from "@/src/types/api";

export const SHOP_AD_FILTERS = ["all", "live", "closed", "expired"] as const;
export type ShopAdFilter = (typeof SHOP_AD_FILTERS)[number];

/** `GET /api/shops/:id/listings` — the shop's ads that are not products. */
export interface ShopAdsPage {
	docs: ListingDoc[];
	totalDocs: number;
	page: number;
	hasNextPage: boolean;
	counts: Record<ShopAdFilter, number>;
}

/** Every view of one shop's ads, so closing one drops them all. */
export const shopAdsRootKey = (shopId: string) =>
	["shops", shopId, "ads"] as const;

export function useShopAds(shopId: string | undefined, filter: ShopAdFilter) {
	return useInfiniteQuery({
		queryKey: [...shopAdsRootKey(shopId ?? ""), filter] as const,
		queryFn: ({ pageParam }) =>
			api.get<ShopAdsPage>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/listings?filter=${filter}&page=${pageParam}`,
			),
		initialPageParam: 1,
		getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
		enabled: Boolean(shopId),
	});
}

/**
 * Closes an ad (let, filled, done — stored as `sold`). Only its seller, the
 * shop's owner, may: the listing refuses anyone else.
 */
export function useCloseShopAd(shopId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (listingId: string) =>
			api.patch(`/api/listings/${listingId}`, { status: "sold" }),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: shopAdsRootKey(shopId ?? ""),
			}),
	});
}
