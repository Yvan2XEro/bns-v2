/**
 * Display-only vocabulary for P7's shipments: which `delivery.*` translation key a screen shows for each server value.
 * Explicit literals on purpose (fully qualified, mobile calls `t()` without a namespace); a key built at runtime is invisible to the key scanners.
 * Web holds the same tables in `src/lib/shipment-status.ts`; `packages/api/tests/int/shipment-vocab-parity.int.spec.ts` holds both to the API's enums and to each other, cell for cell.
 */

export type ShipmentStatus =
	| "pending"
	| "picked_up"
	| "in_transit"
	| "delivered"
	| "failed"
	| "returned"
	| "cancelled";

export type FailureReason =
	| "refused"
	| "absent"
	| "unreachable"
	| "address_not_found"
	| "rescheduled_by_buyer"
	| "not_collected"
	| "damaged"
	| "other";

export type DeliveryWindow = "morning" | "afternoon" | "evening";

export type ShipmentAudience = "buyer" | "seller";

export const SHIPMENT_STATUS_LABELS: Record<
	ShipmentAudience,
	Record<ShipmentStatus, string>
> = {
	buyer: {
		pending: "delivery.statusBuyer.pending",
		picked_up: "delivery.statusBuyer.picked_up",
		in_transit: "delivery.statusBuyer.in_transit",
		delivered: "delivery.statusBuyer.delivered",
		failed: "delivery.statusBuyer.failed",
		returned: "delivery.statusBuyer.returned",
		cancelled: "delivery.statusBuyer.cancelled",
	},
	seller: {
		pending: "delivery.statusSeller.pending",
		picked_up: "delivery.statusSeller.picked_up",
		in_transit: "delivery.statusSeller.in_transit",
		delivered: "delivery.statusSeller.delivered",
		failed: "delivery.statusSeller.failed",
		returned: "delivery.statusSeller.returned",
		cancelled: "delivery.statusSeller.cancelled",
	},
};

/** A `pending` shipment the buyer collects shows this instead of the preparing label (`readyForPickupAt` present). */
export const READY_FOR_PICKUP_LABELS: Record<ShipmentAudience, string> = {
	buyer: "delivery.pendingReadyBuyer",
	seller: "delivery.pendingReadySeller",
};

export const FAILURE_REASON_LABELS: Record<FailureReason, string> = {
	refused: "delivery.failureReason.refused",
	absent: "delivery.failureReason.absent",
	unreachable: "delivery.failureReason.unreachable",
	address_not_found: "delivery.failureReason.address_not_found",
	rescheduled_by_buyer: "delivery.failureReason.rescheduled_by_buyer",
	not_collected: "delivery.failureReason.not_collected",
	damaged: "delivery.failureReason.damaged",
	other: "delivery.failureReason.other",
};

export const WINDOW_LABELS: Record<DeliveryWindow, string> = {
	morning: "delivery.window.morning",
	afternoon: "delivery.window.afternoon",
	evening: "delivery.window.evening",
};

export const DELIVERY_HINT_LABELS = {
	freeAbove: "delivery.freeAboveHint",
	minimum: "delivery.minimumHint",
} as const;

export function shipmentStatusLabel(
	audience: ShipmentAudience,
	status: ShipmentStatus,
	readyForPickup = false,
): string {
	return status === "pending" && readyForPickup
		? READY_FOR_PICKUP_LABELS[audience]
		: SHIPMENT_STATUS_LABELS[audience][status];
}
