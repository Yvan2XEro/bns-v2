"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { activityKey } from "~/lib/query-keys";
import { shopApi } from "~/lib/shop-api";
import type { ShopActivityAction, ShopActivityTargetType } from "~/types";

export { activityKey };

export interface ShopActivityFilters {
	actor?: string;
	action?: ShopActivityAction;
	targetType?: ShopActivityTargetType;
}

/** One shop's activity log, paged with the server's own cursor. */
export function useShopActivity(
	shopId: string | null,
	filters: ShopActivityFilters = {},
) {
	return useInfiniteQuery({
		queryKey: activityKey(shopId ?? "", filters),
		queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
			shopApi.listActivity(shopId ?? "", { ...filters, cursor: pageParam }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		enabled: Boolean(shopId),
		retry: false,
	});
}
