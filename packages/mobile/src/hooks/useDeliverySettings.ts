import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
	Courier,
	DeliveryZone,
	ShopLocation,
} from "../../../api/src/payload-types";
import { api } from "../lib/api";
import type { toLocationInput } from "../lib/deliveryLocationForm";
import type { toZoneInput } from "../lib/deliveryZoneForm";

export const deliveryZonesKey = (shopId: string) =>
	["shops", shopId, "delivery-zones"] as const;
export const deliveryLocationsKey = (shopId: string) =>
	["shops", shopId, "locations"] as const;
export const couriersKey = (city: string) => ["couriers", city] as const;

type ZoneInput = ReturnType<typeof toZoneInput>;
type LocationInput = ReturnType<typeof toLocationInput>;

const shopPath = (shopId: string, segment: string) =>
	`/api/shops/${encodeURIComponent(shopId)}/${segment}`;

export function useDeliveryZones(shopId: string | undefined) {
	return useQuery({
		queryKey: deliveryZonesKey(shopId ?? ""),
		queryFn: () =>
			api.get<DeliveryZone[]>(shopPath(shopId ?? "", "delivery-zones")),
		enabled: Boolean(shopId),
	});
}

function useInvalidate(key: readonly unknown[]) {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: key });
}

export function useSaveZone(shopId: string, zoneId: string | null) {
	const invalidate = useInvalidate(deliveryZonesKey(shopId));
	return useMutation({
		mutationFn: (input: ZoneInput) =>
			zoneId
				? api.patch<DeliveryZone>(
						`/api/delivery-zones/${encodeURIComponent(zoneId)}`,
						input,
					)
				: api.post<DeliveryZone>(shopPath(shopId, "delivery-zones"), input),
		onSuccess: invalidate,
	});
}

export function useDeleteZone(shopId: string) {
	const invalidate = useInvalidate(deliveryZonesKey(shopId));
	return useMutation({
		mutationFn: (zoneId: string) =>
			api.delete<{ deleted: boolean; deactivated: boolean }>(
				`/api/delivery-zones/${encodeURIComponent(zoneId)}`,
			),
		onSuccess: invalidate,
	});
}

export function useDeliveryLocations(shopId: string | undefined) {
	return useQuery({
		queryKey: deliveryLocationsKey(shopId ?? ""),
		queryFn: () => api.get<ShopLocation[]>(shopPath(shopId ?? "", "locations")),
		enabled: Boolean(shopId),
	});
}

export function useSaveLocation(shopId: string, locationId: string | null) {
	const invalidate = useInvalidate(deliveryLocationsKey(shopId));
	return useMutation({
		mutationFn: (input: LocationInput) =>
			locationId
				? api.patch<ShopLocation>(
						`/api/locations/${encodeURIComponent(locationId)}`,
						input,
					)
				: api.post<ShopLocation>(shopPath(shopId, "locations"), input),
		onSuccess: invalidate,
	});
}

export function useDeactivateLocation(shopId: string) {
	const invalidate = useInvalidate(deliveryLocationsKey(shopId));
	return useMutation({
		mutationFn: (locationId: string) =>
			api.delete<unknown>(`/api/locations/${encodeURIComponent(locationId)}`),
		onSuccess: invalidate,
	});
}

/** Payload's own REST list: the couriers collection answers `active` rows to any signed-in user. */
export function useActiveCouriers(city: string, enabled: boolean) {
	return useQuery({
		queryKey: couriersKey(city),
		queryFn: async () => {
			const search = new URLSearchParams({
				"where[status][equals]": "active",
				"where[cities][contains]": city,
				depth: "0",
				limit: "50",
			});
			const page = await api.get<{ docs: Courier[] }>(
				`/api/couriers?${search.toString()}`,
			);
			return page.docs;
		},
		enabled,
		staleTime: 300_000,
	});
}
