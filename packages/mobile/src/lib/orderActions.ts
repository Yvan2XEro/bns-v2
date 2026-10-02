import type { ShopRole } from "../types/api";
import type { OrderAudienceKind, OrderView } from "../types/order";
import type { OrderStatusName } from "./orderStatus";
import { can, type ShopPermission } from "./shopRoles";

/**
 * Which buttons one state of one order offers one audience.
 *
 * Every row below is derived from the landed backend, which is the authority
 * here — a button the API will refuse is a 403 or a 409 the user reads as a
 * bug in the app:
 *
 *  - `services/orders/transitions.ts` — `STATUS_TRANSITIONS` (which status may
 *    become which) and `RESERVED_STATUSES` / `assertStatusAuthority` (which of
 *    them this phase may write at all, which is why `paid`, `returned` and
 *    `disputed` offer nothing but the receipt);
 *  - `access/orderAccess.ts` — one caller has exactly one audience, staff
 *    before buyer before shop, and `requireOrderShopPermission` narrows a shop
 *    audience to one permission;
 *  - each route's own guard under `app/(frontend)/api/orders/[id]/` — notably
 *    that `confirm`, `confirmation-code/resend`, `cancel`, `confirm-receipt`,
 *    `contest-delivery`, `handover-code/regenerate` and `withdrawal` are the
 *    *buyer's* alone (a shop member gets `order.notFound` there), while
 *    `handover`, `declare-delivered`, `delivery-attempt-failed` and
 *    `mark-delivery-failed` are the shop's.
 *
 * The same table is derived independently in `packages/web` from these same
 * sources; the two are diffed by hand when both land, because neither
 * package's tests can see the other's copy.
 */
export type OrderAction =
	// buyer
	| "confirm_code"
	| "resend_code"
	| "cancel_order"
	| "confirm_receipt"
	| "regenerate_handover_code"
	| "contest_delivery"
	| "request_withdrawal"
	| "review_shop"
	// shop
	| "confirm_by_call"
	| "accept_order"
	| "decline_order"
	| "seller_cancel_order"
	| "ship_order"
	| "verify_handover_code"
	| "declare_delivered"
	| "report_failed_attempt"
	| "mark_delivery_failed"
	// every audience
	| "view_receipt";

export const ORDER_ACTIONS: readonly OrderAction[] = [
	"confirm_code",
	"resend_code",
	"cancel_order",
	"confirm_receipt",
	"regenerate_handover_code",
	"contest_delivery",
	"request_withdrawal",
	"review_shop",
	"confirm_by_call",
	"accept_order",
	"decline_order",
	"seller_cancel_order",
	"ship_order",
	"verify_handover_code",
	"declare_delivered",
	"report_failed_attempt",
	"mark_delivery_failed",
	"view_receipt",
];

/**
 * The 33 cells, flat and in one literal so it can be diffed against web's
 * copy mechanically. Order within a cell is the order a screen renders the
 * actions in, with the receipt last everywhere.
 *
 * Time- and counter-dependent conditions are deliberately *not* in here —
 * `availableActions` applies them on top, because a cell answers "is this
 * action part of this state at all", which is the half that must agree across
 * packages.
 */
export const ORDER_ACTION_TABLE: Record<
	OrderStatusName,
	Record<OrderAudienceKind, readonly OrderAction[]>
> = {
	placed: {
		buyer: ["confirm_code", "resend_code", "cancel_order", "view_receipt"],
		shop: [
			"confirm_by_call",
			"decline_order",
			"seller_cancel_order",
			"view_receipt",
		],
		staff: ["view_receipt"],
	},
	confirmed: {
		buyer: ["cancel_order", "view_receipt"],
		shop: [
			"accept_order",
			"decline_order",
			"seller_cancel_order",
			"view_receipt",
		],
		staff: ["view_receipt"],
	},
	paid: {
		buyer: ["view_receipt"],
		shop: ["view_receipt"],
		staff: ["view_receipt"],
	},
	accepted: {
		buyer: ["cancel_order", "view_receipt"],
		shop: ["ship_order", "seller_cancel_order", "view_receipt"],
		staff: ["view_receipt"],
	},
	shipped: {
		buyer: ["confirm_receipt", "regenerate_handover_code", "view_receipt"],
		shop: [
			"verify_handover_code",
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
			"view_receipt",
		],
		staff: ["view_receipt"],
	},
	delivered: {
		buyer: [
			"contest_delivery",
			"request_withdrawal",
			"review_shop",
			"view_receipt",
		],
		shop: ["view_receipt"],
		staff: ["view_receipt"],
	},
	completed: {
		buyer: ["review_shop", "view_receipt"],
		shop: ["view_receipt"],
		staff: ["view_receipt"],
	},
	cancelled: {
		buyer: ["view_receipt"],
		shop: ["view_receipt"],
		staff: ["view_receipt"],
	},
	delivery_failed: {
		buyer: ["view_receipt"],
		shop: ["view_receipt"],
		staff: ["view_receipt"],
	},
	returned: {
		buyer: ["view_receipt"],
		shop: ["view_receipt"],
		staff: ["view_receipt"],
	},
	disputed: {
		buyer: ["view_receipt"],
		shop: ["view_receipt"],
		staff: ["view_receipt"],
	},
};

/**
 * The shop permission each shop action's route demands. `seller_cancel_order`
 * is the one that is not `orders.process`: `POST /api/orders/{id}/seller-cancel`
 * goes through `requireOrderShopPermission(..., "orders.cancel")`, which the
 * role matrix gives an owner and a manager and never a staff member.
 * `view_receipt` needs none — `requireOrderAudience` alone gates it.
 */
export const ORDER_ACTION_PERMISSIONS: Partial<
	Record<OrderAction, ShopPermission>
> = {
	confirm_by_call: "orders.process",
	accept_order: "orders.process",
	decline_order: "orders.process",
	seller_cancel_order: "orders.cancel",
	ship_order: "orders.process",
	verify_handover_code: "orders.process",
	declare_delivered: "orders.process",
	report_failed_attempt: "orders.process",
	mark_delivery_failed: "orders.process",
};

/**
 * The fields the table's conditions read. A `Pick` of `OrderView` rather than
 * a shape of its own, so the one thing a screen already has in hand is the
 * only thing it has to pass.
 */
export type OrderActionSubject = Pick<
	OrderView,
	| "status"
	| "paymentMethod"
	| "completionHold"
	| "deadlines"
	| "deliveryFailure"
>;

export interface AvailableActionsOptions {
	/** Injected by tests; the deadline comparisons below are the only clock use. */
	now?: Date;
}

function elapsed(deadline: string | null | undefined, now: Date): boolean {
	if (!deadline) return false;
	const at = Date.parse(deadline);
	return Number.isFinite(at) && now.getTime() > at;
}

/**
 * The conditions the server will apply anyway, limited to what an order
 * projection actually carries. `handover.locked`, `confirmation.attemptsLeft`,
 * `handover.regenerationsLeft`, the 48-hour contest window and `reviewable`
 * are *not* served by `serializeOrderFor*`, so the actions that depend on them
 * are offered and the server's own error code is what the screen reports —
 * guessing those rules here would be re-implementing them in a client.
 */
function conditionHolds(
	action: OrderAction,
	order: OrderActionSubject,
	now: Date,
): boolean {
	switch (action) {
		// `deadlines.confirmBy` is set only while a buyer confirmation is
		// outstanding, and `cancelByConfirmationExpiry` kills the order once it
		// passes — so its presence is what says "a code is still expected", and
		// it gates the seller's call path for the same reason.
		case "confirm_code":
		case "resend_code":
		case "confirm_by_call":
			return (
				Boolean(order.deadlines.confirmBy) &&
				!elapsed(order.deadlines.confirmBy, now)
			);
		// `acceptOrder` throws `order.acceptDeadlinePassed` past this one.
		case "accept_order":
			return !elapsed(order.deadlines.acceptBy, now);
		// `reportFailedAttempt` refuses a second attempt, pointing the caller at
		// `mark-delivery-failed` instead.
		case "report_failed_attempt":
			return (order.deliveryFailure?.attempts ?? 0) < 1;
		// `openWithdrawal` refuses once the order already carries a return case,
		// and `completionHold` is the served half of that state.
		case "request_withdrawal":
			return (
				order.completionHold !== "return_case" &&
				order.completionHold !== "dispute" &&
				!elapsed(order.deadlines.withdrawalUntil, now)
			);
		// `contestDelivery` sets `completionHold: "dispute"`, so a second contest
		// is already answered by the first one's effect.
		case "contest_delivery":
			return order.completionHold !== "dispute";
		default:
			return true;
	}
}

/**
 * Every action this audience may take on this order, in render order.
 *
 * `role` is the caller's resolved shop role and is read only for a `shop`
 * audience — `can()` from `shopRoles.ts` is the single mirror of the server's
 * permission matrix, never a role-string comparison.
 */
export function availableActions(
	order: OrderActionSubject,
	audience: OrderAudienceKind,
	role: ShopRole | null | undefined,
	options: AvailableActionsOptions = {},
): OrderAction[] {
	const now = options.now ?? new Date();
	return ORDER_ACTION_TABLE[order.status][audience].filter((action) => {
		const permission = ORDER_ACTION_PERMISSIONS[action];
		if (permission && !can(role, permission)) return false;
		return conditionHolds(action, order, now);
	});
}

export function canTakeAction(
	order: OrderActionSubject,
	action: OrderAction,
	audience: OrderAudienceKind,
	role: ShopRole | null | undefined,
	options: AvailableActionsOptions = {},
): boolean {
	return availableActions(order, audience, role, options).includes(action);
}
