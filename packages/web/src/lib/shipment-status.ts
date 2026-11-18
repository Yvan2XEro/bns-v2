/**
 * Display-only vocabulary for P7's shipments: which `Delivery.*` translation key a screen shows for each server value.
 * Explicit literals on purpose (namespace-relative); a key built at runtime is invisible to the key scanners.
 * Mobile holds the same tables in `src/lib/shipmentStatus.ts`; `packages/api/tests/int/shipment-vocab-parity.int.spec.ts` holds both to the API's enums and to each other, cell for cell.
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
		pending: "statusBuyer.pending",
		picked_up: "statusBuyer.picked_up",
		in_transit: "statusBuyer.in_transit",
		delivered: "statusBuyer.delivered",
		failed: "statusBuyer.failed",
		returned: "statusBuyer.returned",
		cancelled: "statusBuyer.cancelled",
	},
	seller: {
		pending: "statusSeller.pending",
		picked_up: "statusSeller.picked_up",
		in_transit: "statusSeller.in_transit",
		delivered: "statusSeller.delivered",
		failed: "statusSeller.failed",
		returned: "statusSeller.returned",
		cancelled: "statusSeller.cancelled",
	},
};

/** A `pending` shipment the buyer collects shows this instead of the preparing label (`readyForPickupAt` present). */
export const READY_FOR_PICKUP_LABELS: Record<ShipmentAudience, string> = {
	buyer: "pendingReadyBuyer",
	seller: "pendingReadySeller",
};

export const FAILURE_REASON_LABELS: Record<FailureReason, string> = {
	refused: "failureReason.refused",
	absent: "failureReason.absent",
	unreachable: "failureReason.unreachable",
	address_not_found: "failureReason.address_not_found",
	rescheduled_by_buyer: "failureReason.rescheduled_by_buyer",
	not_collected: "failureReason.not_collected",
	damaged: "failureReason.damaged",
	other: "failureReason.other",
};

export const WINDOW_LABELS: Record<DeliveryWindow, string> = {
	morning: "window.morning",
	afternoon: "window.afternoon",
	evening: "window.evening",
};

export const DELIVERY_HINT_LABELS = {
	freeAbove: "freeAboveHint",
	minimum: "minimumHint",
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
