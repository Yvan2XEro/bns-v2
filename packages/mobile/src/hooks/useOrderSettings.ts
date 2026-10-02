import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ShopOrderSettings } from "../types/order";

/** Shop-scoped, so `useInvalidateShop` in `useShops.ts` already reaches it. */
export const orderSettingsKey = (shopId: string) =>
	["shops", shopId, "order-settings"] as const;

/**
 * There is no `/api/shops/{id}/order-settings` route in the backend: the
 * `orderSettings` group lives on the shop document, readable through Payload's
 * own `GET /api/shops/{id}` and writable through `PATCH /api/shops/{id}` under
 * `settings.edit`. So this reads the shop and hands back just that group,
 * under its own key, so the form's own save can drop it on its own.
 *
 * Two fields of the phase plan's `OrderSettingsView` have no producer at all —
 * the shop's COD caps and the launch city's default delivery fee. The caps are
 * not published anywhere; the city default is in `GET /api/public/config`'s
 * `launchCities`, which `useAppConfig()` already carries, so a screen reads it
 * from there rather than having this hook recompute a rule the server owns.
 */
export function useOrderSettings(shopId: string | undefined) {
	return useQuery({
		queryKey: orderSettingsKey(shopId ?? ""),
		queryFn: async () => {
			const shop = await api.get<{ orderSettings?: ShopOrderSettings | null }>(
				`/api/shops/${shopId}?depth=0`,
			);
			return shop.orderSettings ?? {};
		},
		enabled: Boolean(shopId),
	});
}

export function useUpdateOrderSettings(shopId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (orderSettings: ShopOrderSettings) =>
			api.patch<{ doc?: { orderSettings?: ShopOrderSettings | null } }>(
				`/api/shops/${shopId}`,
				{ orderSettings },
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
