"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import type { OrderStatusName } from "~/lib/order-status";
import { purchaseKey, purchaseShipmentsKey } from "~/lib/query-keys";
import type { RescheduleInput } from "~/lib/reschedule-form";
import { shipmentsExist } from "~/lib/shipment-tracking";
import { apiGet, apiPost } from "~/lib/shop-api";
import {
	type BuyerShipmentView,
	isOutForDelivery,
} from "../../../api/src/contracts/shipments";

/**
 * The buyer's shipments of one purchase, nested under `purchaseKey` so every
 * order action that already refreshes the purchase refreshes the tracking too.
 */
export function usePurchaseShipments(orderId: string, status: OrderStatusName) {
	return useQuery<BuyerShipmentView[], ApiError>({
		queryKey: purchaseShipmentsKey(orderId),
		queryFn: () =>
			apiGet<BuyerShipmentView[]>(
				`/api/orders/${encodeURIComponent(orderId)}/shipments`,
			),
		enabled: shipmentsExist(status),
		retry: false,
		// Keeps the rider card and the courier's ETA current while a parcel is on the road.
		refetchInterval: (query) =>
			query.state.data?.some((shipment) => isOutForDelivery(shipment.status))
				? 60_000
				: false,
	});
}

export function useRescheduleShipment(orderId: string, shipmentId: string) {
	const queryClient = useQueryClient();
	return useMutation<unknown, ApiError, RescheduleInput>({
		mutationKey: ["shipments", "reschedule", shipmentId],
		mutationFn: (input) =>
			apiPost(
				`/api/shipments/${encodeURIComponent(shipmentId)}/reschedule`,
				input,
			),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: purchaseKey(orderId) });
		},
	});
}
