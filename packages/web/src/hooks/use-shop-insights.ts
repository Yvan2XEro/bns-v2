"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { shopInsightsKey } from "~/lib/query-keys";
import { apiGet } from "~/lib/shop-api";
import type {
	InsightsPeriod,
	ShopInsightsView,
} from "../../../api/src/types/shopInsights";

export { shopInsightsKey } from "~/lib/query-keys";

export function useShopInsights(shopId: string | null, period: InsightsPeriod) {
	return useQuery<ShopInsightsView, ApiError>({
		queryKey: shopInsightsKey(shopId ?? "", period),
		queryFn: () =>
			apiGet<ShopInsightsView>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/insights?period=${period}`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}
