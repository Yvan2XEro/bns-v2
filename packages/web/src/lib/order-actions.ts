import type { OrderAudienceKind, OrderView } from "~/types/order";
import type { ShopRole } from "../types";
import type { OrderStatusName } from "./order-status";
import { can, type ShopPermission } from "./shop-roles";

/**
 * Which buttons an order's current state offers, and to whom. The single
 * source for every order screen: a screen that decides for itself offers an
 * action the API will refuse, and the user gets a 403 from a button that
 * looked live.
 *
 * Every row of `ORDER_ACTIONS_BY_STATUS` is derived from the landed API, not
 * from a screen description:
 *
 *  - `services/orders/transitions.ts#STATUS_TRANSITIONS` says which status
 *    may become which, and `assertStatusAuthority` refuses every transition
 *    touching `paid`, `returned` or `disputed` unless the caller carries a
 *    P5/P6 context — except `UNRESERVED_TRANSITIONS`, P5's `paid →
 *    accepted|cancelled`. That is why `returned` and `disputed` offer
 *    nothing, and `paid` offers the shop's accept or decline and the buyer's
 *    cancel.
 *  - `services/orders/acceptance.ts` carries the three narrower status lists
 *    the table in `transitions.ts` deliberately does not:
 *    `DECLINABLE_STATUSES` is `placed`/`confirmed`/`paid`,
 *    `SELLER_CANCELLABLE_STATUSES` is `placed`/`confirmed`/`accepted`, and
 *    `BUYER_CANCELLABLE_STATUSES` is `placed`/`confirmed`/`paid`/`accepted`.
 *  - the seven delivery routes each guard `order.status !== "shipped"` and
 *    each pick their own audience: `requireOrderShopPermission(…,
 *    "orders.process")` for `handover`, `declare-delivered`,
 *    `delivery-attempt-failed` and `mark-delivery-failed`;
 *    `requireOrderBuyer` for `confirm-receipt`, `contest-delivery` and
 *    `handover-code/regenerate`.
 *  - `services/orders/withdrawal.ts#openWithdrawal` is buyer-only and
 *    `delivered`-only.
 *  - `services/orders/queries.ts#getOrderReceiptHtml` gates on
 *    `requireOrderAudience` alone, so all three audiences may print, in every
 *    status.
 *  - `services/moderation.ts#MODERATOR_CANCELLABLE_STATUSES` is exactly
 *    `placed`/`confirmed`/`accepted`/`shipped`; outside those
 *    `POST /api/moderation/orders/{id}` with `{ action: "cancel" }` answers
 *    `moderationInvalidTransition`. That list is the whole staff row.
 *  - `services/reviewRules.ts#ORDER_REVIEWABLE_STATUSES` is exactly
 *    `delivered`/`completed`, so `review_shop` sits in those two buyer cells
 *    and nowhere else.
 *
 * The table is a flat `status × audience → actions` record on purpose:
 * `packages/mobile/src/lib/orderActions.ts` carries the same table under the
 * same action names, and
 * `packages/api/tests/int/order-actions-parity.int.spec.ts` imports both into
 * one API test and compares them cell for cell with no name map. An action
 * added or moved here and not there fails that test.
 */
export type OrderAction =
	| "confirm_code"
	| "resend_code"
	| "cancel"
	| "confirm_by_call"
	| "accept"
	| "decline"
	| "seller_cancel"
	| "ship"
	| "handover"
	| "declare_delivered"
	| "report_failed_attempt"
	| "mark_delivery_failed"
	| "confirm_receipt"
	| "regenerate_handover_code"
	| "contest_delivery"
	| "request_withdrawal"
	| "staff_cancel"
	| "review_shop"
	| "receipt";

/**
 * The route each action calls, `{id}` standing for the order id. Kept beside
 * the table so a reviewer can check a row against a real endpoint without
 * leaving this file, and so `use-order-actions.ts` has one place to read the
 * path from.
 */
export const ORDER_ACTION_ROUTES: Record<
	OrderAction,
	{ method: "GET" | "POST"; path: string }
> = {
	confirm_code: { method: "POST", path: "/api/orders/{id}/confirm" },
	resend_code: {
		method: "POST",
		path: "/api/orders/{id}/confirmation-code/resend",
	},
	cancel: { method: "POST", path: "/api/orders/{id}/cancel" },
	confirm_by_call: { method: "POST", path: "/api/orders/{id}/confirm-by-call" },
	accept: { method: "POST", path: "/api/orders/{id}/accept" },
	decline: { method: "POST", path: "/api/orders/{id}/decline" },
	seller_cancel: { method: "POST", path: "/api/orders/{id}/seller-cancel" },
	ship: { method: "POST", path: "/api/orders/{id}/ship" },
	handover: { method: "POST", path: "/api/orders/{id}/handover" },
	declare_delivered: {
		method: "POST",
		path: "/api/orders/{id}/declare-delivered",
	},
	report_failed_attempt: {
		method: "POST",
		path: "/api/orders/{id}/delivery-attempt-failed",
	},
	mark_delivery_failed: {
		method: "POST",
		path: "/api/orders/{id}/mark-delivery-failed",
	},
	confirm_receipt: { method: "POST", path: "/api/orders/{id}/confirm-receipt" },
	regenerate_handover_code: {
		method: "POST",
		path: "/api/orders/{id}/handover-code/regenerate",
	},
	contest_delivery: {
		method: "POST",
		path: "/api/orders/{id}/contest-delivery",
	},
	request_withdrawal: { method: "POST", path: "/api/orders/{id}/withdrawal" },
	/** Task 24's route; staff never reach the party-facing ones above. */
	staff_cancel: { method: "POST", path: "/api/moderation/orders/{id}" },
	/**
	 * The one action whose route is not order-scoped: a review is created on
	 * the `reviews` collection carrying the order, and `enforceReviewRules`
	 * resolves the shop and `verifiedPurchase` from it.
	 */
	review_shop: { method: "POST", path: "/api/reviews" },
	receipt: { method: "GET", path: "/api/orders/{id}/receipt" },
};

export function orderActionPath(action: OrderAction, orderId: string): string {
	return ORDER_ACTION_ROUTES[action].path.replace(
		"{id}",
		encodeURIComponent(orderId),
	);
}

/**
 * The shop permission each shop-side route is gated on, from the route's own
 * `requireOrderShopPermission` call. `seller_cancel` is the one that is not
 * `orders.process`: `sellerCancelOrder` asks for `orders.cancel`, which the
 * matrix grants an owner and a manager and never a staff member. Reading it
 * from the matrix is the point — a role comparison here would be the same
 * shortcut P3 paid for.
 */
export const ORDER_ACTION_PERMISSIONS: Partial<
	Record<OrderAction, ShopPermission>
> = {
	accept: "orders.process",
	decline: "orders.process",
	confirm_by_call: "orders.process",
	seller_cancel: "orders.cancel",
	ship: "orders.process",
	handover: "orders.process",
	declare_delivered: "orders.process",
	report_failed_attempt: "orders.process",
	mark_delivery_failed: "orders.process",
};

/** Display order inside a row: the primary action first, the receipt last. */
export const ORDER_ACTIONS_BY_STATUS: Record<
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
		buyer: ["cancel", "receipt"],
		shop: ["accept", "decline", "receipt"],
		staff: ["staff_cancel", "receipt"],
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
	cancelled: { buyer: ["receipt"], shop: ["receipt"], staff: ["receipt"] },
	delivery_failed: {
		buyer: ["receipt"],
		shop: ["receipt"],
		staff: ["receipt"],
	},
	returned: { buyer: ["receipt"], shop: ["receipt"], staff: ["receipt"] },
	disputed: { buyer: ["receipt"], shop: ["receipt"], staff: ["receipt"] },
};

/**
 * Exactly the fields `availableActions` reads. A `Pick` rather than a fresh
 * interface, so a full `OrderView` is accepted unchanged and a test fixture
 * stays small — and so a change to the contract's own shape is a type error
 * here rather than a silent drift.
 */
export type OrderActionSubject = Pick<
	OrderView,
	| "status"
	| "confirmation"
	| "handover"
	| "deadlines"
	| "deliveryFailure"
	| "completionHold"
	| "returnCaseNumber"
	| "reviewable"
>;

/** A deadline the API may legitimately not have set: absent means unbounded. */
function beforeOptionalDeadline(at: string | null, now: Date): boolean {
	if (at === null) return true;
	const deadline = Date.parse(at);
	return !Number.isFinite(deadline) || now.getTime() <= deadline;
}

/**
 * A window that must exist to be open. `contestDelivery` and
 * `openWithdrawal` both refuse an order with no deadline recorded, so an
 * absent one reads as closed rather than unbounded.
 */
function insideWindow(at: string | null, now: Date): boolean {
	if (at === null) return false;
	const deadline = Date.parse(at);
	return Number.isFinite(deadline) && now.getTime() <= deadline;
}

/**
 * Whether the order's own data still allows an action its status and audience
 * already offer. Every branch below mirrors a refusal the API would answer
 * with, named in the comment: this function never invents a stricter rule
 * than the server's, because a button the server would accept and the client
 * hides is a feature the buyer cannot reach.
 */
function conditionHolds(
	action: OrderAction,
	order: OrderActionSubject,
	now: Date,
): boolean {
	switch (action) {
		// `checkConfirmation` refuses when no code was ever issued
		// (`order.confirmationCodeInvalid`), when the five attempts are spent,
		// and once the 24-hour TTL — which `deadlines.confirmBy` mirrors — has
		// passed (`order.confirmationCodeExpired`).
		case "confirm_code":
			return (
				order.confirmation.required === "sms_code" &&
				order.confirmation.attemptsLeft > 0 &&
				beforeOptionalDeadline(order.deadlines.confirmBy, now)
			);
		// `canResend`: three resends, and the same expiry.
		case "resend_code":
			return (
				order.confirmation.required === "sms_code" &&
				order.confirmation.resendsLeft > 0 &&
				beforeOptionalDeadline(order.deadlines.confirmBy, now)
			);
		// `confirmBySellerCall` checks `confirmBy` and nothing about
		// `confirmation.required` — a seller who reaches the buyer by phone
		// may confirm whichever path was originally chosen, which is the whole
		// point of the escape hatch.
		case "confirm_by_call":
			return beforeOptionalDeadline(order.deadlines.confirmBy, now);
		// `acceptOrder`: `order.acceptDeadlinePassed` past the 48 hours.
		case "accept":
			return beforeOptionalDeadline(order.deadlines.acceptBy, now);
		// `checkHandover` answers `order.handoverLocked` on `lockedAt` or on
		// the fifth wrong code; `attemptsLeft` is read too, so a client that
		// has the count but not yet the flag stops at the same point.
		case "handover":
			return !order.handover.locked && order.handover.attemptsLeft > 0;
		// `canRegenerate`: three regenerations per order.
		case "regenerate_handover_code":
			return order.handover.regenerationsLeft > 0;
		// `contestDelivery` answers `order.contestWindowClosed` both for a
		// handover that was not a declaration and for a window that has run
		// out — from the buyer's side the two are the same fact.
		case "contest_delivery":
			return (
				(order.handover.method === "seller_declaration" ||
					order.handover.method === "carrier_pod") &&
				insideWindow(order.deadlines.contestBy, now)
			);
		// `openWithdrawal`: `order.withdrawalWindowClosed` past the 15 days,
		// `order.withdrawalAlreadyRequested` once a case exists. The hold is
		// the same fact read off the order rather than off the case.
		case "request_withdrawal":
			return (
				insideWindow(order.deadlines.withdrawalUntil, now) &&
				order.returnCaseNumber === null &&
				order.completionHold !== "return_case"
			);
		// `reportFailedAttempt` refuses a second attempt outright, telling the
		// caller to use `mark-delivery-failed` instead.
		case "report_failed_attempt":
			return (order.deliveryFailure?.attempts ?? 0) < 1;
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
 * The actions this order offers this caller, in the table's display order.
 *
 * `role` is only consulted for the `shop` audience, and only through the
 * permission matrix `can()` reads — never by comparing the role string. A
 * `shop` caller whose role is unknown gets the read-only row, which is what
 * `resolveShopRole` returning `null` means: access removed, not a blank
 * screen.
 *
 * `now` is a parameter so a screen's countdown and a test agree on the same
 * instant; it defaults to the real clock.
 */
export function availableActions(
	order: OrderActionSubject,
	audience: OrderAudienceKind,
	role: ShopRole | null = null,
	now: Date = new Date(),
): OrderAction[] {
	const row = ORDER_ACTIONS_BY_STATUS[order.status][audience];
	return row.filter((action) => {
		const permission = ORDER_ACTION_PERMISSIONS[action];
		if (audience === "shop" && permission && !can(role, permission)) {
			return false;
		}
		return conditionHolds(action, order, now);
	});
}
