"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import type { OrderStatusName } from "~/lib/order-status";
import {
	shopOrderKey,
	shopOrderShipmentsKey,
	shopOrdersRootKey,
} from "~/lib/query-keys";
import { PANEL_ACTION_ROUTES, type PanelAction } from "~/lib/shipment-panel";
import { shipmentsExist } from "~/lib/shipment-tracking";
import { apiDelete, apiGet, apiPost, apiPostForm } from "~/lib/shop-api";
import type { ShopShipmentView } from "../../../api/src/contracts/shipments";

export { shopOrderShipmentsKey };

const shipmentPath = (shipmentId: string) =>
	`/api/shipments/${encodeURIComponent(shipmentId)}`;

/**
 * The shop's views of one order's shipments (`GET /api/orders/{id}/shipments`
 * answers the buyer's projection to the buyer and this one to either shop).
 */
export function useOrderShipments(
	shopId: string,
	orderId: string,
	status: OrderStatusName,
) {
	return useQuery<ShopShipmentView[], ApiError>({
		queryKey: shopOrderShipmentsKey(shopId, orderId),
		queryFn: () =>
			apiGet<ShopShipmentView[]>(
				`/api/orders/${encodeURIComponent(orderId)}/shipments`,
			),
		enabled: shipmentsExist(status),
		retry: false,
	});
}

/** A status change moves the order too, so the order and the shop's queue are dropped with the shipments. */
function useShipmentMutation<TVars, TData>(
	shopId: string,
	orderId: string,
	key: string,
	mutationFn: (vars: TVars) => Promise<TData>,
) {
	const queryClient = useQueryClient();
	return useMutation<TData, ApiError, TVars>({
		mutationKey: ["shipments", "shop", key, orderId],
		mutationFn,
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: shopOrderShipmentsKey(shopId, orderId),
			});
			void queryClient.invalidateQueries({
				queryKey: shopOrderKey(shopId, orderId),
			});
			void queryClient.invalidateQueries({
				queryKey: shopOrdersRootKey(shopId),
			});
		},
	});
}

/** The plain status actions: start, ready for pickup, handover, declaration, attempt, return, remittance. */
export function useShipmentAction(shopId: string, orderId: string) {
	return useShipmentMutation(
		shopId,
		orderId,
		"action",
		(vars: {
			shipmentId: string;
			action: Exclude<
				PanelAction,
				"assign_rider" | "rider_link" | "switch_carrier"
			>;
			body?: Record<string, unknown>;
		}) =>
			apiPost<Record<string, unknown>>(
				`${shipmentPath(vars.shipmentId)}/${PANEL_ACTION_ROUTES[vars.action]}`,
				vars.body ?? {},
			),
	);
}

export type RiderAssignment =
	| { userId: string }
	| { name: string; phone: string };

export function useAssignRider(shopId: string, orderId: string) {
	return useShipmentMutation(
		shopId,
		orderId,
		"assign-rider",
		(vars: { shipmentId: string } & RiderAssignment) => {
			const { shipmentId, ...body } = vars;
			return apiPost<{ id: string }>(
				`${shipmentPath(shipmentId)}/${PANEL_ACTION_ROUTES.assign_rider}`,
				body,
			);
		},
	);
}

export type CarrierChoiceInput =
	| { carrier: "self" }
	| { carrier: "courier"; courierId: string };

export function useSwitchCarrier(shopId: string, orderId: string) {
	return useShipmentMutation(
		shopId,
		orderId,
		"switch-carrier",
		(vars: { shipmentId: string; choice: CarrierChoiceInput }) =>
			apiPost<{ id: string; carrier: string }>(
				`${shipmentPath(vars.shipmentId)}/${PANEL_ACTION_ROUTES.switch_carrier}`,
				vars.choice,
			),
	);
}

/** Answers the link's URL once; only its hash is stored, so it cannot be fetched again. */
export function useCreateRiderLink(shopId: string, orderId: string) {
	return useShipmentMutation(
		shopId,
		orderId,
		"rider-link",
		(shipmentId: string) =>
			apiPost<{ url: string }>(
				`${shipmentPath(shipmentId)}/${PANEL_ACTION_ROUTES.rider_link}`,
			),
	);
}

export function useRevokeRiderLink(shopId: string, orderId: string) {
	return useShipmentMutation(
		shopId,
		orderId,
		"rider-link-revoke",
		(shipmentId: string) =>
			apiDelete<{ revoked: true }>(
				`${shipmentPath(shipmentId)}/${PANEL_ACTION_ROUTES.rider_link}`,
			),
	);
}

export function useShipmentRemittance(shopId: string, orderId: string) {
	return useShipmentMutation(
		shopId,
		orderId,
		"remittance",
		(vars: {
			shipmentId: string;
			action: "confirm" | "dispute";
			note?: string;
		}) =>
			apiPost<{ remittanceStatus: string | null }>(
				`${shipmentPath(vars.shipmentId)}/${PANEL_ACTION_ROUTES.confirm_remittance}`,
				{ action: vars.action, ...(vars.note ? { note: vars.note } : {}) },
			),
	);
}

/** Uploads a handover, declaration or attempt photo and answers the proof row's id. */
export function useUploadShipmentPhoto() {
	return useMutation<
		{ id: string },
		ApiError,
		{
			shipmentId: string;
			file: File;
			kind: "attempt" | "handover" | "declaration";
		}
	>({
		mutationKey: ["shipments", "shop", "photo"],
		mutationFn: ({ shipmentId, file, kind }) => {
			const form = new FormData();
			form.append("file", file);
			form.append("kind", kind);
			return apiPostForm<{ id: string }>(
				`${shipmentPath(shipmentId)}/photo`,
				form,
			);
		},
		retry: false,
	});
}
