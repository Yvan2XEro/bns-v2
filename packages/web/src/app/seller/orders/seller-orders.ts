import { availableActions, type OrderAction } from "~/lib/order-actions";
import { SHOP_ORDER_TABS, type ShopOrderTab } from "~/lib/order-status";
import type { ShopRole } from "~/types";
import type { BuyerTier, OrderView } from "~/types/order";

/**
 * The seller's order screens keep every decision they render here, as pure
 * functions, because the web package has no component-render harness: what
 * is not in a module like this one cannot be pinned by a test.
 */

/** The shop-row actions the action bar knows how to present. */
type ShopAction = Extract<
	OrderAction,
	| "confirm_by_call"
	| "accept"
	| "decline"
	| "seller_cancel"
	| "ship"
	| "handover"
	| "declare_delivered"
	| "report_failed_attempt"
	| "mark_delivery_failed"
	| "receipt"
>;

/** Posted straight away: the API needs nothing but the order. */
const POST_ACTIONS = ["accept", "ship", "confirm_by_call"] as const;
export type PostAction = (typeof POST_ACTIONS)[number];
/** Collects a reason, a code or a note first. */
export type DialogAction = Exclude<ShopAction, PostAction | "receipt">;

export function isPostAction(action: ShopAction): action is PostAction {
	return (POST_ACTIONS as readonly ShopAction[]).includes(action);
}

export type ActionTone = "primary" | "secondary" | "danger";

export interface ActionBarItem {
	action: ShopAction;
	tone: ActionTone;
	/** Key in the `SellerOrders` namespace. */
	labelKey: string;
}

const PRESENTATION: Record<ShopAction, Omit<ActionBarItem, "action">> = {
	confirm_by_call: { tone: "primary", labelKey: "confirmByCallAccept" },
	accept: { tone: "primary", labelKey: "accept" },
	decline: { tone: "danger", labelKey: "decline" },
	seller_cancel: { tone: "danger", labelKey: "cancelOrder" },
	ship: { tone: "primary", labelKey: "ship" },
	handover: { tone: "primary", labelKey: "enterHandoverCode" },
	declare_delivered: { tone: "secondary", labelKey: "declareDelivered" },
	report_failed_attempt: { tone: "secondary", labelKey: "reportFailedAttempt" },
	mark_delivery_failed: { tone: "danger", labelKey: "markFailed" },
	receipt: { tone: "secondary", labelKey: "receipt" },
};

function isShopAction(action: OrderAction): action is ShopAction {
	return action in PRESENTATION;
}

/**
 * The action bar is `availableActions(order, "shop", role)` and nothing else:
 * which buttons a state offers, and which a staff member does not get, is the
 * table's and the permission matrix's answer, never a role comparison here.
 * An action the table offers and this screen cannot present is dropped, which
 * the test beside this file turns into a failure.
 */
export function actionBarItems(
	order: OrderView,
	role: ShopRole | null,
	now: Date = new Date(),
): ActionBarItem[] {
	return availableActions(order, "shop", role, now)
		.filter(isShopAction)
		.map((action) => ({ action, ...PRESENTATION[action] }));
}

export function isShopOrderTab(value: unknown): value is ShopOrderTab {
	return (
		typeof value === "string" &&
		(SHOP_ORDER_TABS as readonly string[]).includes(value)
	);
}

const TIER_KEYS: Record<BuyerTier, string> = {
	new: "tierNew",
	regular: "tierRegular",
	trusted: "tierTrusted",
	watch: "tierWatch",
	blocked: "tierBlocked",
};

export function tierLabelKey(tier: BuyerTier): string {
	return TIER_KEYS[tier];
}

export function tierTone(tier: BuyerTier): "good" | "neutral" | "warning" {
	if (tier === "trusted" || tier === "regular") return "good";
	if (tier === "watch" || tier === "blocked") return "warning";
	return "neutral";
}

export type Countdown =
	| { expired: true }
	| { expired: false; hours: number; minutes: number };

/**
 * Time left to accept, rounded down to the minute. `null` when the order has
 * no acceptance deadline, which the API reads as unbounded.
 */
export function acceptCountdown(
	acceptBy: string | null | undefined,
	now: Date,
): Countdown | null {
	if (!acceptBy) return null;
	const deadline = Date.parse(acceptBy);
	if (!Number.isFinite(deadline)) return null;
	const left = deadline - now.getTime();
	if (left <= 0) return { expired: true };
	const totalMinutes = Math.floor(left / 60_000);
	return {
		expired: false,
		hours: Math.floor(totalMinutes / 60),
		minutes: totalMinutes % 60,
	};
}

/**
 * A Maps search for where the buyer is: the GPS pin when they shared one,
 * otherwise the landmark with its district and city. `null` when neither was
 * given, so the screen shows no link rather than one to nowhere.
 */
export function mapsUrl(delivery: OrderView["delivery"]): string | null {
	const base = "https://www.google.com/maps/search/?api=1&query=";
	if (delivery.gps) {
		return `${base}${delivery.gps.lat},${delivery.gps.lng}`;
	}
	if (!delivery.landmark) return null;
	const place = [
		delivery.landmark,
		districtLabel(delivery),
		delivery.city,
		"Cameroun",
	]
		.filter(Boolean)
		.join(", ");
	return `${base}${encodeURIComponent(place)}`;
}

/** `tel:` is only offered for a number the API did not mask. */
export function telHref(delivery: OrderView["delivery"]): string | null {
	if (delivery.phoneMasked || !delivery.phone) return null;
	return `tel:${delivery.phone.replace(/\s+/g, "")}`;
}

/**
 * Districts are stored as `"city.district"` keys, with `districtOther` for
 * the free-text "other" choice; neither has a translation table yet.
 */
export function districtLabel(delivery: OrderView["delivery"]): string {
	if (delivery.districtOther) return delivery.districtOther;
	const tail = delivery.district.split(".").pop() ?? "";
	if (!tail || tail === "other") return "";
	return tail
		.split(/[-_]/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/** Basis points as a percentage, e.g. `750` → `"7.5"`. */
export function ratePercent(rateBps: number): string {
	return String(Math.round(rateBps) / 100);
}

const KNOWN_EVENTS = new Set([
	"placed",
	"receipt_sent",
	"confirmation_code_sent",
	"confirmed",
	"accepted",
	"declined",
	"accept_reminder_sent",
	"shipped",
	"handover_code_sent",
	"handover_code_regenerated",
	"handover_failed_attempt",
	"handover_locked",
	"delivery_attempt_failed",
	"delivered",
	"delivery_contested",
	"delivery_failed",
	"cancelled",
	"withdrawal_requested",
	"completed",
	"commission_accrued",
	"note_added",
]);

/** `"order.placed"` → `"event_placed"`; an event type this screen does not know reads as generic. */
export function eventLabelKey(type: string): string {
	const name = type.startsWith("order.") ? type.slice("order.".length) : type;
	return KNOWN_EVENTS.has(name) ? `event_${name}` : "event_other";
}

export const EVENT_LABEL_KEYS = [...KNOWN_EVENTS, "other"].map(
	(name) => `event_${name}`,
);
