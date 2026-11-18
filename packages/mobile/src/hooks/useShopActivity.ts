import { useInfiniteQuery } from "@tanstack/react-query";
import { shopApi } from "../lib/api";
import { type ShopActivityFilters, shopKeys } from "./useShops";

/** 50 entries per page, keyset-paginated on `createdAt` — `ACTIVITY_PAGE_SIZE` on the API. */
export function useShopActivity(
	shopId: string | undefined,
	filters: ShopActivityFilters = {},
) {
	return useInfiniteQuery({
		queryKey: shopKeys.activity(shopId ?? "", filters),
		queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
			shopApi.listActivity(shopId ?? "", { ...filters, cursor: pageParam }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		enabled: Boolean(shopId),
	});
}
