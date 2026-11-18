import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CourierMember, Shipment } from "../../../api/src/payload-types";
import { useAppConfig } from "../contexts/AppConfigContext";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { shipmentsRootKey } from "./useShipmentActions";

export interface CourierShipmentRow {
	id: string;
	shipmentNumber: string;
	status: Shipment["status"];
	courierId: string | null;
	origin: unknown;
	destination: { city?: string; district?: string; landmark?: string } | null;
	codCollection: Shipment["codCollection"] | null;
	rider: Shipment["rider"] | null;
}

export const courierListKey = ["shipments", "courier"] as const;
export const courierMembershipKey = (userId: string) =>
	["courier-members", "mine", userId] as const;

/** Active courier memberships of the signed-in user: the Account entry shows only for these. */
export function useCourierMembership() {
	const { user } = useAuth();
	const { couriersEnabled } = useAppConfig();
	return useQuery({
		queryKey: courierMembershipKey(user?.id ?? ""),
		queryFn: async () => {
			const search = new URLSearchParams({
				"where[user][equals]": user?.id ?? "",
				"where[status][equals]": "active",
				depth: "0",
				limit: "20",
			});
			const page = await api.get<{ docs: CourierMember[] }>(
				`/api/courier-members?${search.toString()}`,
			);
			return page.docs;
		},
		enabled: Boolean(user) && couriersEnabled,
		staleTime: 300_000,
	});
}

export function useCourierShipments() {
	return useQuery({
		queryKey: courierListKey,
		queryFn: () =>
			api.get<{ rows: CourierShipmentRow[]; nextCursor: string | null }>(
				"/api/courier/shipments",
			),
	});
}

function useInvalidateShipments() {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: shipmentsRootKey });
}

export function usePickUp(shipmentId: string) {
	const invalidate = useInvalidateShipments();
	return useMutation({
		mutationFn: (gps?: { lat: number; lng: number }) =>
			api.post<{ id: string; status: string }>(
				`/api/shipments/${encodeURIComponent(shipmentId)}/picked-up`,
				gps ? { gps } : {},
			),
		onSuccess: invalidate,
	});
}

/** Riders of one courier, as a dispatcher may read them through the collection's own access rule. */
export function useCourierRiders(courierId: string | null) {
	return useQuery({
		queryKey: ["courier-members", "riders", courierId] as const,
		queryFn: async () => {
			const search = new URLSearchParams({
				"where[courier][equals]": courierId ?? "",
				"where[role][equals]": "rider",
				"where[status][equals]": "active",
				depth: "1",
				limit: "50",
			});
			const page = await api.get<{ docs: CourierMember[] }>(
				`/api/courier-members?${search.toString()}`,
			);
			return page.docs;
		},
		enabled: Boolean(courierId),
	});
}

export function useAssignCourierRider(shipmentId: string) {
	const invalidate = useInvalidateShipments();
	return useMutation({
		mutationFn: (riderUserId: string) =>
			api.post<{ id: string }>(
				`/api/courier/shipments/${encodeURIComponent(shipmentId)}/assign`,
				{ riderUserId },
			),
		onSuccess: invalidate,
	});
}

export function useDeclareRemitted(shipmentId: string) {
	const invalidate = useInvalidateShipments();
	return useMutation({
		mutationFn: (note?: string) =>
			api.post<{ id: string }>(
				`/api/courier/shipments/${encodeURIComponent(shipmentId)}/cod-remitted`,
				note ? { note } : {},
			),
		onSuccess: invalidate,
	});
}
