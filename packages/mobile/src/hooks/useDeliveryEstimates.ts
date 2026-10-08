import { useQuery } from "@tanstack/react-query";
import { deliveryEstimateRequest } from "../../../api/src/contracts/deliveryEstimateQuery";
import type { PublicDeliveryEstimates } from "../../../api/src/contracts/deliveryQuote";
import { useAppConfig } from "../contexts/AppConfigContext";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export { deliveryEstimateRequest } from "../../../api/src/contracts/deliveryEstimateQuery";

export function useDeliveryEstimates(listingId: string, eligible: boolean) {
	const { ordersEnabled, deliveryZonesEnabled } = useAppConfig();
	const { user, isLoading } = useAuth();
	const request = deliveryEstimateRequest(
		listingId,
		user?.id ?? null,
		user?.homeLocation?.city ?? null,
	);
	return useQuery({
		queryKey: request.queryKey,
		queryFn: () => api.get<PublicDeliveryEstimates>(request.path),
		enabled: eligible && ordersEnabled && deliveryZonesEnabled && !isLoading,
		staleTime: 300_000,
		retry: false,
	});
}
