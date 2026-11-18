import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
	ShipmentView,
	ShopShipmentView,
} from "../../../api/src/contracts/shipments";
import { useAppConfig } from "../contexts/AppConfigContext";
import { api } from "../lib/api";
import type { declareDeliveredBody } from "../lib/proofPhoto";

export const shipmentsRootKey = ["shipments"] as const;
export const shipmentKey = (id: string) => ["shipments", "detail", id] as const;

/** The view is the caller's own: a shop member gets the shop view, a rider the courier view. */
export function useShipment(id: string | undefined) {
	const { deliveryZonesEnabled } = useAppConfig();
	return useQuery({
		queryKey: shipmentKey(id ?? ""),
		queryFn: () =>
			api.get<ShipmentView>(`/api/shipments/${encodeURIComponent(id ?? "")}`),
		enabled: Boolean(id) && deliveryZonesEnabled,
	});
}

export function isShopView(view: ShipmentView): view is ShopShipmentView {
	return "carrier" in view;
}

export interface Gps {
	lat: number;
	lng: number;
}

function useShipmentPost<TBody, TResult = unknown>(
	shipmentId: string,
	segment: string,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: TBody) =>
			api.post<TResult>(
				`/api/shipments/${encodeURIComponent(shipmentId)}/${segment}`,
				body ?? {},
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: shipmentsRootKey }),
	});
}

export const useStartShipment = (id: string) =>
	useShipmentPost<void>(id, "start");
export const useReadyForPickup = (id: string) =>
	useShipmentPost<void>(id, "ready-for-pickup");
export const useHandoverShipment = (id: string) =>
	useShipmentPost<{
		code: string;
		gps?: Gps;
		recipientName?: string;
		photoId?: string;
	}>(id, "handover");
export const useReportAttempt = (id: string) =>
	useShipmentPost<{
		reason: string;
		note?: string;
		gps?: Gps;
		photoId?: string;
	}>(id, "attempts");
export const useDeclareDelivered = (id: string) =>
	useShipmentPost<ReturnType<typeof declareDeliveredBody>>(
		id,
		"declare-delivered",
	);
export const useMarkReturned = (id: string) =>
	useShipmentPost<{ reason?: string }>(id, "returned");
export const useAssignShopRider = (id: string) =>
	useShipmentPost<{ name: string; phone: string }>(id, "rider");
export const useSwitchCarrier = (id: string) =>
	useShipmentPost<
		{ carrier: "self" } | { carrier: "courier"; courierId: string }
	>(id, "carrier");
export const useCodRemittance = (id: string) =>
	useShipmentPost<{ action: "confirm" | "dispute"; note?: string }>(
		id,
		"cod-remittance",
	);
export const useSellerReschedule = (id: string) =>
	useShipmentPost<{
		date: string;
		window: "morning" | "afternoon" | "evening";
		landmark?: string;
	}>(id, "reschedule");

/** The URL comes back once, in the create response; it is never readable again. */
export const useCreateRiderLink = (id: string) =>
	useShipmentPost<void, { url: string }>(id, "rider-link");

export function useRevokeRiderLink(shipmentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () =>
			api.delete<{ id: string; revoked: boolean }>(
				`/api/shipments/${encodeURIComponent(shipmentId)}/rider-link`,
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: shipmentsRootKey }),
	});
}

/** Shop-side list of an order's shipments (the shop audience of the shared route). */
export const orderShopShipmentsKey = (orderId: string) =>
	["shipments", "order", orderId] as const;

export function useShopOrderShipments(orderId: string | undefined) {
	const { deliveryZonesEnabled } = useAppConfig();
	return useQuery({
		queryKey: orderShopShipmentsKey(orderId ?? ""),
		queryFn: () =>
			api.get<ShopShipmentView[]>(
				`/api/orders/${encodeURIComponent(orderId ?? "")}/shipments`,
			),
		enabled: Boolean(orderId) && deliveryZonesEnabled,
	});
}
