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

function pickupPointOf(
	group: OrderSettingsInput,
): OrderSettingsView["pickupPoint"] {
	const point = group.pickupPoint;
	if (!point?.address) return null;
	const lat = point.gps?.lat;
	const lng = point.gps?.lng;
	return {
		address: point.address,
		landmark: point.landmark ?? null,
		gps:
			typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null,
		hours: point.hours ?? null,
	};
}

/**
 * The shop's COD, delivery and pickup settings.
 *
 * Read through Payload's own `GET /api/shops/{id}` because that is the only
 * endpoint that serves them: no task in this plan builds a route answering
 * `OrderSettingsView`, so `caps` and `cityDefaultFee` — both derived
 * server-side, from `shopCapabilities.codCaps` and `deliveryFeeFor` — have no
 * source and come back `null`, which the contract already allows. A screen
 * must therefore render no caps notice rather than compute one; see Task 29's
 * report for the plan defect. When the endpoint lands, the body of this
 * `queryFn` becomes a single `apiGet` and nothing else here changes.
 */
export function useOrderSettings(shopId: string | null) {
	return useQuery<OrderSettingsView, ApiError>({
		queryKey: orderSettingsKey(shopId ?? ""),
		queryFn: async () => {
			const shop = await apiGet<Shop>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}?depth=0`,
			);
			const group: OrderSettingsInput = shop.orderSettings ?? {};
			return {
				codEnabled: group.codEnabled === true,
				sellerDeliveryEnabled: group.sellerDeliveryEnabled !== false,
				deliveryFee: group.deliveryFee ?? null,
				deliveryEtaText: group.deliveryEtaText ?? null,
				pickupEnabled: group.pickupEnabled === true,
				pickupPoint: pickupPointOf(group),
				salesTermsExtra: group.salesTermsExtra ?? null,
				caps: null,
				cityDefaultFee: null,
			};
		},
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
 * Saves the group through the shop's own `PATCH /api/shops/{id}`, which is
 * `settings.edit`-gated — the same gate the rest of the shop's profile uses,
 * so there is no second permission rule to keep in step. The shop document
 * itself changes, so `myShopKey` is dropped alongside these settings.
 */
export function useSaveOrderSettings(shopId: string | null) {
	const queryClient = useQueryClient();
	return useMutation<{ doc: Shop }, ApiError, OrderSettingsInput>({
		mutationKey: [...saveOrderSettingsKey, shopId ?? ""],
		mutationFn: (orderSettings) =>
			apiPatch<{ doc: Shop }>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}`,
				{
					orderSettings,
				},
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
