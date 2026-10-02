import type { OrderTimelineEntry, OrderView } from "../types/order";
import type { OrderAction } from "./orderActions";
import { type OrderStatusName, statusLabelKey } from "./orderStatus";

/**
 * The buyer's purchase screens, reduced to the decisions a render harness
 * would otherwise have to pin. Which buttons exist is never decided here:
 * every function below takes the list `availableActions(order, "buyer")`
 * returned and only arranges it.
 */

export const PURCHASE_TABS = ["open", "delivered", "cancelled"] as const;
export type PurchaseTab = (typeof PURCHASE_TABS)[number];

export const PURCHASE_TAB_LABEL_KEYS: Record<PurchaseTab, string> = {
	open: "purchases.tabOpen",
	delivered: "purchases.tabDelivered",
	cancelled: "purchases.tabCancelled",
};

/**
 * `GET /api/orders` filters on one status at a time and each tab spans
 * several, so the list is fetched unfiltered and partitioned here — the same
 * split as web's `purchase-view.ts`. A dispute stays "open" from the buyer's
 * side: nothing about it is settled yet.
 */
const TAB_OF_STATUS: Record<OrderStatusName, PurchaseTab> = {
	placed: "open",
	confirmed: "open",
	paid: "open",
	accepted: "open",
	shipped: "open",
	disputed: "open",
	delivered: "delivered",
	completed: "delivered",
	returned: "delivered",
	cancelled: "cancelled",
	delivery_failed: "cancelled",
};

export function purchaseTab(status: OrderStatusName): PurchaseTab {
	return TAB_OF_STATUS[status];
}

/** The status as the buyer reads it, fully qualified for `t()`. */
export function purchaseStatusKey(status: OrderStatusName): string {
	return `orderStatus.${statusLabelKey(status, "buyer")}`;
}

/** What a bar button opens: a sheet on this screen, another screen, or the receipt file. */
export type BarActionKind = "sheet" | "screen" | "receipt";

export interface BarAction {
	action: OrderAction;
	labelKey: string;
	kind: BarActionKind;
	tone: "primary" | "outline" | "danger";
}

const BAR_ACTIONS: Partial<Record<OrderAction, Omit<BarAction, "action">>> = {
	confirm_receipt: {
		labelKey: "purchases.confirmReceipt",
		kind: "sheet",
		tone: "primary",
	},
	request_withdrawal: {
		labelKey: "purchases.returnItem",
		kind: "screen",
		tone: "outline",
	},
	contest_delivery: {
		labelKey: "purchases.contestDelivery",
		kind: "sheet",
		tone: "outline",
	},
	cancel: { labelKey: "purchases.cancel", kind: "sheet", tone: "danger" },
	receipt: {
		labelKey: "purchases.downloadReceipt",
		kind: "receipt",
		tone: "outline",
	},
};

/**
 * The bar's buttons, in the table's order. The confirmation code, the
 * handover code and the review are panels of their own on the screen; they
 * read the same list, so they are left out here rather than dropped.
 */
export function barActions(actions: readonly OrderAction[]): BarAction[] {
	return actions.flatMap((action) => {
		const entry = BAR_ACTIONS[action];
		return entry ? [{ action, ...entry }] : [];
	});
}

/** Every `ORDER_EVENT_TYPES` entry, plus the three reserved for P5/P6. */
export const TIMELINE_LABEL_KEYS: Record<string, string> = {
	"order.placed": "purchases.event_placed",
	"order.receipt_sent": "purchases.event_receipt_sent",
	"order.confirmation_code_sent": "purchases.event_confirmation_code_sent",
	"order.confirmed": "purchases.event_confirmed",
	"order.accepted": "purchases.event_accepted",
	"order.declined": "purchases.event_declined",
	"order.accept_reminder_sent": "purchases.event_accept_reminder_sent",
	"order.shipped": "purchases.event_shipped",
	"order.handover_code_sent": "purchases.event_handover_code_sent",
	"order.handover_code_regenerated":
		"purchases.event_handover_code_regenerated",
	"order.handover_failed_attempt": "purchases.event_handover_failed_attempt",
	"order.handover_locked": "purchases.event_handover_locked",
	"order.delivery_attempt_failed": "purchases.event_delivery_attempt_failed",
	"order.delivered": "purchases.event_delivered",
	"order.delivery_contested": "purchases.event_delivery_contested",
	"order.delivery_failed": "purchases.event_delivery_failed",
	"order.cancelled": "purchases.event_cancelled",
	"order.withdrawal_requested": "purchases.event_withdrawal_requested",
	"order.completed": "purchases.event_completed",
	"order.commission_accrued": "purchases.event_commission_accrued",
	"order.note_added": "purchases.event_note_added",
	"order.paid": "purchases.event_paid",
	"order.disputed": "purchases.event_disputed",
	"order.returned": "purchases.event_returned",
};

export const TIMELINE_FALLBACK_KEY = "purchases.event_other";

export function timelineLabelKey(type: OrderTimelineEntry["type"]): string {
	return TIMELINE_LABEL_KEYS[type] ?? TIMELINE_FALLBACK_KEY;
}

const HOUR_MS = 60 * 60 * 1000;

/** Whole days and hours left before `until`; null once it has passed. */
export function windowCountdown(
	until: string | null,
	now: Date,
): { days: number; hours: number } | null {
	if (until === null) return null;
	const left = Date.parse(until) - now.getTime();
	if (!Number.isFinite(left) || left < 0) return null;
	const hours = Math.floor(left / HOUR_MS);
	return { days: Math.floor(hours / 24), hours: hours % 24 };
}

export type WithdrawalWindow =
	| { kind: "none" }
	| { kind: "caseOpen"; caseNumber: string }
	| { kind: "closed" }
	| { kind: "open"; until: string; days: number; hours: number };

/**
 * The window's state in words. Whether the return button exists is the
 * action list's business, read with the same `now`, so the countdown
 * reaching zero and the button leaving happen on the same tick.
 */
export function withdrawalWindow(
	order: Pick<OrderView, "deadlines" | "returnCaseNumber">,
	now: Date,
): WithdrawalWindow {
	const until = order.deadlines.withdrawalUntil;
	if (until === null) return { kind: "none" };
	if (order.returnCaseNumber) {
		return { kind: "caseOpen", caseNumber: order.returnCaseNumber };
	}
	const left = windowCountdown(until, now);
	return left ? { kind: "open", until, ...left } : { kind: "closed" };
}

export const HANDOVER_FALLBACK_KEYS = [
	"purchases.handoverFallbackConfirm",
	"purchases.handoverFallbackSeller",
] as const;

export interface HandoverCardState {
	locked: boolean;
	regenerationsLeft: number;
	canRegenerate: boolean;
	/** Shown only while the code still works: a locked code is no use at the door. */
	showCode: boolean;
	/** The two ways a delivery still finishes once the code is locked, in words. */
	fallbackKeys: readonly string[];
}

/**
 * The plaintext code exists in two places only — the SMS sent at shipping
 * and the answer to a regeneration — so `code` is whatever the last
 * regeneration returned on this screen. The regenerate button is the action
 * list's, never a reading of `regenerationsLeft` here.
 */
export function handoverCardState(
	order: Pick<OrderView, "handover">,
	actions: readonly OrderAction[],
	code: string | undefined,
): HandoverCardState {
	const { locked, regenerationsLeft } = order.handover;
	return {
		locked,
		regenerationsLeft,
		canRegenerate: actions.includes("regenerate_handover_code"),
		showCode: Boolean(code) && !locked,
		fallbackKeys: locked ? HANDOVER_FALLBACK_KEYS : [],
	};
}

/** The file name the shared receipt carries, safe on both platforms. */
export function receiptFileName(orderNumber: string, lang: "fr" | "en") {
	const safe = orderNumber.replace(/[^A-Za-z0-9-]/g, "_");
	return `${lang === "fr" ? "recu" : "receipt"}-${safe}.html`;
}
