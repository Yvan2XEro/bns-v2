import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { OrderSettingsView, ShopOrderSettings } from "../types/order";

/** Shop-scoped, so `useInvalidateShop` in `useShops.ts` already reaches it. */
export const orderSettingsKey = (shopId: string) =>
	["shops", shopId, "order-settings"] as const;

/**
 * `GET /api/shops/{id}/order-settings` — the group plus the two figures only
 * the server can compute: the level's COD caps with the admin overrides
 * merged in, and the launch city's default fee. This hook used to read the
 * raw group off the shop document because the route did not exist yet; the
 * caps notice had no data source at all in that world.
 */
export function useOrderSettings(shopId: string | undefined) {
	return useQuery({
		queryKey: orderSettingsKey(shopId ?? ""),
		queryFn: () =>
			api.get<OrderSettingsView>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/order-settings`,
			),
		enabled: Boolean(shopId),
	});
}

export function useUpdateOrderSettings(shopId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (orderSettings: Partial<ShopOrderSettings>) =>
			api.patch<OrderSettingsView>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/order-settings`,
				orderSettings,
			),
		onSuccess: () => {
			if (!shopId) return;
			queryClient.invalidateQueries({ queryKey: orderSettingsKey(shopId) });
			// `orderSettings.codEnabled` is one of the fields a listing's search
			// document copies (`LISTING_VISIBLE_FIELDS`), so the shop's own views
			// go stale with it.
			queryClient.invalidateQueries({ queryKey: ["shops", shopId] });
		},
	});
}
