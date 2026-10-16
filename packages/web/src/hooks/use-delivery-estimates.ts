"use client";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "~/lib/shop-api";
import { deliveryEstimateRequest } from "../../../api/src/contracts/deliveryEstimateQuery";
import type { PublicDeliveryEstimates } from "../../../api/src/contracts/deliveryQuote";
import { useAppConfig } from "./use-app-config";
import { useAuth } from "./use-auth";
import { useRememberedCity } from "./use-remembered-city";

export { deliveryEstimateRequest } from "../../../api/src/contracts/deliveryEstimateQuery";

export function useDeliveryEstimates(listingId: string, eligible: boolean) {
	const { ordersEnabled, deliveryZonesEnabled } = useAppConfig();
	const { user, isLoading } = useAuth();
	const city = useRememberedCity();
	const request = deliveryEstimateRequest(listingId, user?.id ?? null, city);
	return useQuery({
		queryKey: request.queryKey,
		queryFn: () => apiGet<PublicDeliveryEstimates>(request.path),
		enabled: eligible && ordersEnabled && deliveryZonesEnabled && !isLoading,
		staleTime: 300_000,
		retry: false,
	});
}
