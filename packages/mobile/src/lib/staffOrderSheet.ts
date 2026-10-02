import type { BuyerTier, OrderActorType } from "../types/order";
import { availableActions, type OrderActionSubject } from "./orderActions";
import type { OrderStatusName } from "./orderStatus";

/**
 * The reasons `cancelOrder` in `packages/api/src/services/moderation.ts`
 * accepts (`STAFF_CANCEL_REASONS`); anything else is refused with
 * `moderation.reasonRequired`. `order-actions-parity.int.spec.ts` pins this
 * list to the API's own.
 */
export const STAFF_CANCEL_REASONS = [
	"staff_fraud",
	"staff_policy",
	"staff_other",
] as const;

export type StaffCancelReason = (typeof STAFF_CANCEL_REASONS)[number];

export const STAFF_CANCEL_REASON_KEYS: Record<StaffCancelReason, string> = {
	staff_fraud: "moderationOrder.reason_staff_fraud",
	staff_policy: "moderationOrder.reason_staff_policy",
	staff_other: "moderationOrder.reason_staff_other",
};

/** `blocked` is listed for completeness: a blocked buyer cannot place an order. */
export const BUYER_TIER_KEYS: Record<BuyerTier, string> = {
	new: "sellerOrders.tierNew",
	regular: "sellerOrders.tierRegular",
	trusted: "sellerOrders.tierTrusted",
	watch: "sellerOrders.tierWatch",
	blocked: "moderationOrder.tierBlocked",
};

export interface StaffCancelInput {
	reason: StaffCancelReason;
	note: string | null;
}

export type StaffCancelDraft =
	| { ok: true; input: StaffCancelInput }
	| { ok: false; errorKey: string };

function isStaffCancelReason(value: string | null): value is StaffCancelReason {
	return (STAFF_CANCEL_REASONS as readonly (string | null)[]).includes(value);
}

/**
 * Turns the decision sheet's answer into the route's body. The note is
 * required for `staff_other` only — the server's own rule — which the shared
 * sheet's static `textRequired` flag cannot express, so it is checked here.
 */
export function staffCancelDraft(
	choice: string | null,
	text: string,
): StaffCancelDraft {
	if (!isStaffCancelReason(choice)) {
		return { ok: false, errorKey: "moderation.decisionChoiceRequired" };
	}
	const note = text.trim() || null;
	if (choice === "staff_other" && !note) {
		return { ok: false, errorKey: "moderationOrder.noteRequired" };
	}
	return { ok: true, input: { reason: choice, note } };
}

/**
 * The staff sheet's buttons come off the shared action table and nothing
 * else: `staff_cancel` at the four moderator-cancellable statuses, and the
 * receipt everywhere.
 */
export function staffSheetActions(
	order: OrderActionSubject,
	now?: Date,
): { canCancel: boolean; canReceipt: boolean } {
	const actions = availableActions(order, "staff", null, { now });
	return {
		canCancel: actions.includes("staff_cancel"),
		canReceipt: actions.includes("receipt"),
	};
}

export const ACTOR_KEYS: Record<OrderActorType, string> = {
	buyer: "moderationOrder.actor_buyer",
	seller: "moderationOrder.actor_seller",
	staff: "moderationOrder.actor_staff",
	system: "moderationOrder.actor_system",
	courier: "moderationOrder.actor_courier",
};

/** Transcribed from `ORDER_EVENT_TYPES` in `collections/OrderEvents.ts`. */
export const TIMELINE_EVENT_KEYS: Record<string, string> = {
	"order.placed": "moderationOrder.event_placed",
	"order.receipt_sent": "moderationOrder.event_receipt_sent",
	"order.confirmation_code_sent":
		"moderationOrder.event_confirmation_code_sent",
	"order.confirmed": "moderationOrder.event_confirmed",
	"order.accepted": "moderationOrder.event_accepted",
	"order.declined": "moderationOrder.event_declined",
	"order.accept_reminder_sent": "moderationOrder.event_accept_reminder_sent",
	"order.shipped": "moderationOrder.event_shipped",
	"order.handover_code_sent": "moderationOrder.event_handover_code_sent",
	"order.handover_code_regenerated":
		"moderationOrder.event_handover_code_regenerated",
	"order.handover_failed_attempt":
		"moderationOrder.event_handover_failed_attempt",
	"order.handover_locked": "moderationOrder.event_handover_locked",
	"order.delivery_attempt_failed":
		"moderationOrder.event_delivery_attempt_failed",
	"order.delivered": "moderationOrder.event_delivered",
	"order.delivery_contested": "moderationOrder.event_delivery_contested",
	"order.delivery_failed": "moderationOrder.event_delivery_failed",
	"order.cancelled": "moderationOrder.event_cancelled",
	"order.withdrawal_requested": "moderationOrder.event_withdrawal_requested",
	"order.completed": "moderationOrder.event_completed",
	"order.commission_accrued": "moderationOrder.event_commission_accrued",
	"order.note_added": "moderationOrder.event_note_added",
};

export function timelineEventKey(type: string): string {
	return TIMELINE_EVENT_KEYS[type] ?? "moderationOrder.event_other";
}

/** Every value `ORDER_CANCELLATION_REASONS` in `collections/Orders.ts` holds. */
export const CANCELLATION_REASON_KEYS: Record<string, string> = {
	buyer_changed_mind: "moderationOrder.reason_buyer_changed_mind",
	buyer_ordered_by_mistake: "moderationOrder.reason_buyer_ordered_by_mistake",
	seller_out_of_stock: "moderationOrder.reason_seller_out_of_stock",
	seller_cannot_deliver: "moderationOrder.reason_seller_cannot_deliver",
	seller_buyer_unreachable: "moderationOrder.reason_seller_buyer_unreachable",
	seller_other: "moderationOrder.reason_seller_other",
	confirmation_expired: "moderationOrder.reason_confirmation_expired",
	seller_timeout: "moderationOrder.reason_seller_timeout",
	payment_expired: "moderationOrder.reason_payment_expired",
	...STAFF_CANCEL_REASON_KEYS,
};

/** `ORDER_DELIVERY_FAILURE_REASONS`, already labelled in `orderStatus`. */
const DELIVERY_FAILURE_REASON_KEYS: Record<string, string> = {
	refused: "orderStatus.failure_refused",
	unreachable: "orderStatus.failure_unreachable",
	absent: "orderStatus.failure_absent",
	address_not_found: "orderStatus.failure_address_not_found",
	timeout: "orderStatus.failure_timeout",
	other: "orderStatus.failure_other",
};

/**
 * A timeline row's or a cancellation's `reason`, as a label key. A reason no
 * table knows is shown as the generic label rather than as a raw code.
 */
export function reasonKey(reason: string): string {
	return (
		CANCELLATION_REASON_KEYS[reason] ??
		DELIVERY_FAILURE_REASON_KEYS[reason] ??
		"moderationOrder.reason_unknown"
	);
}

/**
 * The status line a moderator reads: the seller-side wording, spelled out so
 * the key-presence check can see every key (no template-literal key).
 */
export const STAFF_STATUS_KEYS: Record<OrderStatusName, string> = {
	placed: "orderStatus.status_placed_seller",
	confirmed: "orderStatus.status_placed_seller",
	paid: "orderStatus.status_placed_seller",
	accepted: "orderStatus.status_accepted_seller",
	shipped: "orderStatus.status_shipped_seller",
	delivered: "orderStatus.status_delivered_seller",
	completed: "orderStatus.status_delivered_seller",
	cancelled: "orderStatus.status_cancelled_seller",
	delivery_failed: "orderStatus.status_failed_seller",
	returned: "orderStatus.status_returned_seller",
	disputed: "orderStatus.status_disputed_seller",
};
