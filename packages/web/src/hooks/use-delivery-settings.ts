"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import type { LocationInput } from "~/lib/delivery-location-form";
import type { ZoneInput } from "~/lib/delivery-zone-form";
import {
	couriersKey,
	deliveryLocationsKey,
	deliverySettingsKey,
	deliveryZonesKey,
} from "~/lib/query-keys";
import { apiDelete, apiGet, apiPatch, apiPost } from "~/lib/shop-api";
import type { DeliveryQuote } from "../../../api/src/contracts/deliveryQuote";
import type {
	Courier,
	DeliveryZone,
	ShopLocation,
} from "../../../api/src/payload-types";
import { useAppConfig } from "./use-app-config";

export { deliveryLocationsKey, deliveryZonesKey };

const shopPath = (shopId: string) => `/api/shops/${encodeURIComponent(shopId)}`;

export function useShopZones(shopId: string) {
	return useQuery<DeliveryZone[], ApiError>({
		queryKey: deliveryZonesKey(shopId),
		queryFn: () => apiGet<DeliveryZone[]>(`${shopPath(shopId)}/delivery-zones`),
		retry: false,
	});
}

export function useShopLocations(shopId: string) {
	return useQuery<ShopLocation[], ApiError>({
		queryKey: deliveryLocationsKey(shopId),
		queryFn: () => apiGet<ShopLocation[]>(`${shopPath(shopId)}/locations`),
		retry: false,
	});
}

/**
 * The registry's active couriers through the collection's own read access
 * (staff-only fields are stripped for a shop member), asked for only while
 * partner couriers are on.
 */
export function useAvailableCouriers() {
	const { couriersEnabled } = useAppConfig();
	return useQuery<Courier[], ApiError>({
		queryKey: couriersKey(),
		queryFn: async () =>
			(
				await apiGet<{ docs: Courier[] }>(
					"/api/couriers?where[status][equals]=active&limit=100&depth=0",
				)
			).docs,
		enabled: couriersEnabled,
		staleTime: 300_000,
		retry: false,
	});
}

function useDeliveryMutation<TVars, TData>(
	shopId: string,
	key: readonly string[],
	mutationFn: (vars: TVars) => Promise<TData>,
) {
	const queryClient = useQueryClient();
	return useMutation<TData, ApiError, TVars>({
		mutationKey: [...deliverySettingsKey(shopId), ...key],
		mutationFn,
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: deliverySettingsKey(shopId),
			});
		},
	});
}

export const useCreateZone = (shopId: string) =>
	useDeliveryMutation(shopId, ["create-zone"], (input: ZoneInput) =>
		apiPost<DeliveryZone>(`${shopPath(shopId)}/delivery-zones`, input),
	);

export const useUpdateZone = (shopId: string) =>
	useDeliveryMutation(
		shopId,
		["update-zone"],
		(vars: { zoneId: string; input: Partial<ZoneInput> }) =>
			apiPatch<DeliveryZone>(
				`/api/delivery-zones/${encodeURIComponent(vars.zoneId)}`,
				vars.input,
			),
	);

/** Deletes an unused zone, or deactivates one an order or shipment still references. */
export const useDisableZone = (shopId: string) =>
	useDeliveryMutation(shopId, ["disable-zone"], (zoneId: string) =>
		apiDelete<{ deleted: boolean; deactivated: boolean }>(
			`/api/delivery-zones/${encodeURIComponent(zoneId)}`,
		),
	);

export const useCreateLocation = (shopId: string) =>
	useDeliveryMutation(shopId, ["create-location"], (input: LocationInput) =>
		apiPost<ShopLocation>(`${shopPath(shopId)}/locations`, input),
	);

export const useUpdateLocation = (shopId: string) =>
	useDeliveryMutation(
		shopId,
		["update-location"],
		(vars: { locationId: string; input: Partial<LocationInput> }) =>
			apiPatch<ShopLocation>(
				`/api/locations/${encodeURIComponent(vars.locationId)}`,
				vars.input,
			),
	);

export const useDisableLocation = (shopId: string) =>
	useDeliveryMutation(shopId, ["disable-location"], (locationId: string) =>
		apiDelete<unknown>(`/api/locations/${encodeURIComponent(locationId)}`),
	);

export interface TestAddressInput {
	city: string;
	district?: string;
	subtotal: number;
}

/** The quote route's own `{ options, unavailable }`, shown verbatim; nothing is saved. */
export function useTestAddress(shopId: string) {
	return useMutation<DeliveryQuote, ApiError, TestAddressInput>({
		mutationKey: [...deliverySettingsKey(shopId), "test-address"],
		mutationFn: (input) =>
			apiPost<DeliveryQuote>(`${shopPath(shopId)}/delivery-zones/test`, input),
		retry: false,
	});
}
