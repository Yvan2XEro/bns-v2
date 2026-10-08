import { useQuery } from "@tanstack/react-query";
import {
	deliveryCitiesRequest,
	type PublicDeliveryCities,
	type PublicPickupPoint,
	pickupPointsRequest,
} from "../../../api/src/contracts/publicPickupPoint";
import { useAppConfig } from "../contexts/AppConfigContext";
import { api } from "../lib/api";

export { pickupPointsRequest } from "../../../api/src/contracts/publicPickupPoint";

export function usePickupPoints(handle: string) {
	const { ordersEnabled, deliveryZonesEnabled } = useAppConfig();
	const request = pickupPointsRequest(handle);
	return useQuery({
		queryKey: request.queryKey,
		queryFn: () => api.get<PublicPickupPoint[]>(request.path),
		enabled: Boolean(handle) && ordersEnabled && deliveryZonesEnabled,
		staleTime: 300_000,
	});
}

export function useDeliveryCities(shopId: string) {
	const { ordersEnabled, deliveryZonesEnabled } = useAppConfig();
	const request = deliveryCitiesRequest(shopId);
	return useQuery({
		queryKey: request.queryKey,
		queryFn: () => api.get<PublicDeliveryCities>(request.path),
		enabled: Boolean(shopId) && ordersEnabled && deliveryZonesEnabled,
		staleTime: 300_000,
	});
}
