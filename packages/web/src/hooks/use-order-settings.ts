"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { myShopKey } from "~/hooks/use-my-shop";
import type { ApiError } from "~/lib/apiError";
import { orderSettingsKey } from "~/lib/query-keys";
import { apiGet, apiPatch } from "~/lib/shop-api";
import type { Shop } from "~/types";
import type { OrderSettingsView } from "~/types/order";

export { orderSettingsKey };

/**
 * The writable half, taken straight off the generated collection type rather
 * than mirrored: `Shops.orderSettings` is the group the shop's own
 * `access.update` (`settings.edit`) governs, and a hand-written copy here
 * would be free to drift from it.
 */
export type OrderSettingsInput = NonNullable<Shop["orderSettings"]>;

/**
 * The shop's COD, delivery and pickup settings, straight off
 * `GET /api/shops/{id}/order-settings` — the route that answers
 * `OrderSettingsView` whole, including the two fields only the server can
 * state: `caps` (the shop's effective-level COD ceilings) and
 * `cityDefaultFee` (what the launch city charges when the shop sets no fee of
 * its own). It is `payments.view`-gated, so a staff member reads neither.
 */
export function useOrderSettings(shopId: string | null) {
	return useQuery<OrderSettingsView, ApiError>({
		queryKey: orderSettingsKey(shopId ?? ""),
		queryFn: () =>
			apiGet<OrderSettingsView>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/order-settings`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

export const saveOrderSettingsKey = [
	"shops",
	"order-settings",
	"save",
] as const;

/**
 * Saves the group through `PATCH /api/shops/{id}/order-settings`, which is
 * `settings.edit`-gated — the same permission `PATCH /api/shops/{id}` demands
 * for this group, so there is no second rule to keep in step — and answers
 * the fresh `OrderSettingsView`. The shop document itself changes (a search
 * reindex hangs off `orderSettings.codEnabled`), so `myShopKey` is dropped
 * alongside these settings.
 */
export function useSaveOrderSettings(shopId: string | null) {
	const queryClient = useQueryClient();
	return useMutation<OrderSettingsView, ApiError, OrderSettingsInput>({
		mutationKey: [...saveOrderSettingsKey, shopId ?? ""],
		mutationFn: (orderSettings) =>
			apiPatch<OrderSettingsView>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/order-settings`,
				orderSettings,
			),
		retry: false,
		onSuccess: () => {
			if (!shopId) return;
			void queryClient.invalidateQueries({
				queryKey: orderSettingsKey(shopId),
			});
			void queryClient.invalidateQueries({ queryKey: myShopKey });
		},
	});
}
