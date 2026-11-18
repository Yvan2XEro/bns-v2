"use client";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "~/lib/shop-api";
import {
	deliveryCitiesRequest,
	type PublicDeliveryCities,
	type PublicPickupPoint,
	pickupPointsRequest,
} from "../../../api/src/contracts/publicPickupPoint";
import { useAppConfig } from "./use-app-config";

export { pickupPointsRequest } from "../../../api/src/contracts/publicPickupPoint";

export function usePickupPoints(handle: string) {
	const { ordersEnabled, deliveryZonesEnabled } = useAppConfig();
	const request = pickupPointsRequest(handle);
	return useQuery({
		queryKey: request.queryKey,
		queryFn: () => apiGet<PublicPickupPoint[]>(request.path),
		enabled: Boolean(handle) && ordersEnabled && deliveryZonesEnabled,
		staleTime: 300_000,
	});
}

export function useDeliveryCities(shopId: string) {
	const { ordersEnabled, deliveryZonesEnabled } = useAppConfig();
	const request = deliveryCitiesRequest(shopId);
	return useQuery({
		queryKey: request.queryKey,
		queryFn: () => apiGet<PublicDeliveryCities>(request.path),
		enabled: Boolean(shopId) && ordersEnabled && deliveryZonesEnabled,
		staleTime: 300_000,
	});
}
