import { useQuery } from "@tanstack/react-query";
import type {
	InsightsPeriod,
	ShopInsightsView,
} from "../../../api/src/types/shopInsights";
import { api } from "../lib/api";

export const shopInsightsKey = (shopId: string, period: InsightsPeriod) =>
	["shops", shopId, "insights", period] as const;

export function useShopInsights(
	shopId: string | undefined,
	period: InsightsPeriod,
) {
	return useQuery({
		queryKey: shopInsightsKey(shopId ?? "", period),
		queryFn: () =>
			api.get<ShopInsightsView>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/insights?period=${period}`,
			),
		enabled: Boolean(shopId),
	});
}
