import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BuyerShipmentView } from "../../../api/src/contracts/shipments";
import { useAppConfig } from "../contexts/AppConfigContext";
import { api } from "../lib/api";
import { purchasesRootKey } from "./usePurchases";

/** Under `purchasesRootKey`, so any order mutation drops the tracking block with the order. */
export const orderShipmentsKey = (orderId: string) =>
	["purchases", "detail", orderId, "shipments"] as const;

export function useOrderShipments(orderId: string | undefined) {
	const { deliveryZonesEnabled } = useAppConfig();
	return useQuery({
		queryKey: orderShipmentsKey(orderId ?? ""),
		queryFn: () =>
			api.get<BuyerShipmentView[]>(
				`/api/orders/${encodeURIComponent(orderId ?? "")}/shipments`,
			),
		enabled: Boolean(orderId) && deliveryZonesEnabled,
	});
}

export interface RescheduleInput {
	date: string;
	window: "morning" | "afternoon" | "evening";
	landmark?: string;
	gps?: { lat: number; lng: number };
}

export function useRescheduleShipment(shipmentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: RescheduleInput) =>
			api.post<{ id: string; status: string }>(
				`/api/shipments/${encodeURIComponent(shipmentId)}/reschedule`,
				input,
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: purchasesRootKey }),
	});
}
