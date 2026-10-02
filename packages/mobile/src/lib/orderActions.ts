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
 *  - `services/moderation.ts#MODERATOR_CANCELLABLE_STATUSES` — the staff
 *    cancellation lever behind `POST /api/moderation/orders/{id}` with
 *    `{ action: "cancel" }`, `placed`/`confirmed`/`accepted`/`shipped` only.
 *  - `services/reviewRules.ts#ORDER_REVIEWABLE_STATUSES` — the buyer's review
 *    of the shop (`POST /api/reviews` carrying `order`), `delivered` and
 *    `completed` only.
 *
 * `packages/web/src/lib/order-actions.ts` carries the same table, with the
 * same action names on purpose: `order-actions-parity.int.spec.ts` imports
 * both into one API test and compares them cell for cell, with no name map.
 * An action added or moved here and not there fails that test.
 */
export type OrderAction =
	// buyer
	| "confirm_code"
	| "resend_code"
	| "cancel"
	| "confirm_receipt"
	| "regenerate_handover_code"
	| "contest_delivery"
	| "request_withdrawal"
	| "review_shop"
	// shop
	| "confirm_by_call"
	| "accept"
	| "decline"
	| "seller_cancel"
	| "ship"
	| "handover"
	| "declare_delivered"
	| "report_failed_attempt"
	| "mark_delivery_failed"
	// staff
	| "staff_cancel"
	// every audience
	| "receipt";

export const ORDER_ACTIONS: readonly OrderAction[] = [
	"confirm_code",
	"resend_code",
	"cancel",
	"confirm_receipt",
	"regenerate_handover_code",
	"contest_delivery",
	"request_withdrawal",
	"review_shop",
	"confirm_by_call",
	"accept",
	"decline",
	"seller_cancel",
	"ship",
	"handover",
	"declare_delivered",
	"report_failed_attempt",
	"mark_delivery_failed",
	"staff_cancel",
	"receipt",
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
		buyer: ["confirm_code", "resend_code", "cancel", "receipt"],
		shop: ["confirm_by_call", "decline", "seller_cancel", "receipt"],
		staff: ["staff_cancel", "receipt"],
	},
	confirmed: {
		buyer: ["cancel", "receipt"],
		shop: ["accept", "decline", "seller_cancel", "receipt"],
		staff: ["staff_cancel", "receipt"],
	},
	paid: {
		buyer: ["receipt"],
		shop: ["receipt"],
		staff: ["receipt"],
	},
	accepted: {
		buyer: ["cancel", "receipt"],
		shop: ["ship", "seller_cancel", "receipt"],
		staff: ["staff_cancel", "receipt"],
	},
	shipped: {
		buyer: ["confirm_receipt", "regenerate_handover_code", "receipt"],
		shop: [
			"handover",
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
			"receipt",
		],
		staff: ["staff_cancel", "receipt"],
	},
	delivered: {
		buyer: ["contest_delivery", "request_withdrawal", "review_shop", "receipt"],
		shop: ["receipt"],
		staff: ["receipt"],
	},
	completed: {
		buyer: ["review_shop", "receipt"],
		shop: ["receipt"],
		staff: ["receipt"],
	},
	cancelled: {
		buyer: ["receipt"],
		shop: ["receipt"],
		staff: ["receipt"],
	},
	delivery_failed: {
		buyer: ["receipt"],
		shop: ["receipt"],
		staff: ["receipt"],
	},
	returned: {
		buyer: ["receipt"],
		shop: ["receipt"],
		staff: ["receipt"],
	},
	disputed: {
		buyer: ["receipt"],
		shop: ["receipt"],
		staff: ["receipt"],
	},
};

/**
 * The shop permission each shop action's route demands. `seller_cancel`
 * is the one that is not `orders.process`: `POST /api/orders/{id}/seller-cancel`
 * goes through `requireOrderShopPermission(..., "orders.cancel")`, which the
 * role matrix gives an owner and a manager and never a staff member.
 * `receipt` needs none — `requireOrderAudience` alone gates it, and neither
 * does `staff_cancel`: a moderator is authorised by `isModerator`, not by a
 * shop role, so a shop permission on it would hide it from everyone.
 */
export const ORDER_ACTION_PERMISSIONS: Partial<
	Record<OrderAction, ShopPermission>
> = {
	confirm_by_call: "orders.process",
	accept: "orders.process",
	decline: "orders.process",
	seller_cancel: "orders.cancel",
	ship: "orders.process",
	handover: "orders.process",
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
	| "reviewable"
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
		case "accept":
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
		// `reviewRules` is the judge — one review per order, buyer only — and
		// the serialiser answers it as `reviewable`, so the button and the
		// route refuse for the same reason at the same moment.
		case "review_shop":
			return order.reviewable;
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
		if (audience === "shop" && permission && !can(role, permission)) {
			return false;
		}
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
