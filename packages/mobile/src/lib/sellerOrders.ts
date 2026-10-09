import { z } from "zod";
import type { ShopRole } from "../types/api";
import type {
	BuyerTier,
	DeliveryFailureReason,
	OrderDeliveryView,
	OrderListEntry,
	OrderView,
	SellerEndReason,
} from "../types/order";
import {
	type AvailableActionsOptions,
	availableActions,
	type OrderAction,
	type OrderActionSubject,
} from "./orderActions";
import {
	SHOP_ORDER_TABS,
	type ShopOrderTab,
	TAB_STATUSES,
} from "./orderStatus";
import { telLink } from "./shopContact";

/**
 * The seller's order screens keep every decision they render here, because
 * mobile has no component-render harness: what is not in a module like this
 * one cannot be pinned by a test.
 */

/**
 * The shop actions the action bar presents. `receipt` is the one shop cell
 * entry left out: the receipt is token-gated HTML that needs a WebView, which
 * this package does not ship yet, so a button for it would lead nowhere.
 */
export type ShopBarAction = Extract<
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
>;

/** `post` sends at once, `sheet` collects a reason or a note first, `screen` navigates. */
export type ActionKind = "post" | "sheet" | "screen";
export type ActionTone = "primary" | "secondary" | "danger";

export interface ActionBarItem {
	action: ShopBarAction;
	kind: ActionKind;
	tone: ActionTone;
	labelKey: string;
}

const PRESENTATION: Record<ShopBarAction, Omit<ActionBarItem, "action">> = {
	confirm_by_call: {
		kind: "post",
		tone: "primary",
		labelKey: "sellerOrders.confirmByCallAccept",
	},
	accept: { kind: "post", tone: "primary", labelKey: "sellerOrders.accept" },
	decline: { kind: "sheet", tone: "danger", labelKey: "sellerOrders.decline" },
	seller_cancel: {
		kind: "sheet",
		tone: "danger",
		labelKey: "sellerOrders.cancelOrder",
	},
	ship: { kind: "post", tone: "primary", labelKey: "sellerOrders.ship" },
	handover: {
		kind: "screen",
		tone: "primary",
		labelKey: "sellerOrders.enterHandoverCode",
	},
	declare_delivered: {
		kind: "sheet",
		tone: "secondary",
		labelKey: "sellerOrders.declareDelivered",
	},
	report_failed_attempt: {
		kind: "sheet",
		tone: "secondary",
		labelKey: "sellerOrders.reportFailedAttempt",
	},
	mark_delivery_failed: {
		kind: "sheet",
		tone: "danger",
		labelKey: "sellerOrders.markFailed",
	},
};

function isBarAction(action: OrderAction): action is ShopBarAction {
	return action in PRESENTATION;
}

export type PostAction = Extract<
	ShopBarAction,
	"confirm_by_call" | "accept" | "ship"
>;
export type SheetAction = Exclude<ShopBarAction, PostAction | "handover">;

export function isPostAction(action: ShopBarAction): action is PostAction {
	return PRESENTATION[action].kind === "post";
}

export function isSheetAction(action: ShopBarAction): action is SheetAction {
	return PRESENTATION[action].kind === "sheet";
}

/**
 * With a live shipment the shipment screen owns these three: the legacy order
 * routes post no proof photo, so `declare_delivered` always dead-ends and the
 * other two duplicate it. No shipment keeps the P4 buttons unchanged.
 */
const PANEL_OWNED: ReadonlySet<ShopBarAction> = new Set([
	"ship",
	"handover",
	"declare_delivered",
]);

/**
 * `availableActions(order, "shop", role)` and nothing else: a staff member
 * seeing no cancel is the permission matrix's answer, never a role
 * comparison made here.
 */
export function actionBarItems(
	order: OrderActionSubject,
	role: ShopRole | null | undefined,
	now?: Date,
	liveShipment = false,
): ActionBarItem[] {
	const options: AvailableActionsOptions = now ? { now } : {};
	return availableActions(order, "shop", role, options)
		.filter(isBarAction)
		.filter((action) => !(liveShipment && PANEL_OWNED.has(action)))
		.map((action) => ({ action, ...PRESENTATION[action] }));
}

/** A cancelled shipment hands nothing over; any other one makes the screen the owner. */
export function hasLiveShipment(
	shipments: ReadonlyArray<{ status: string }> | undefined,
): boolean {
	return (shipments ?? []).some((shipment) => shipment.status !== "cancelled");
}

/** What the bar renders: the order's table answer minus what its shipments own. */
export function actionBarItemsFor(
	order: OrderActionSubject,
	role: ShopRole | null | undefined,
	shipments: ReadonlyArray<{ status: string }> | undefined,
	now?: Date,
): ActionBarItem[] {
	return actionBarItems(order, role, now, hasLiveShipment(shipments));
}

function offers(items: readonly ActionBarItem[], action: ShopBarAction) {
	return items.some((item) => item.action === action);
}

/**
 * The handover screen stays open while the order still waits on its
 * delivery outcome — keypad or, once `handover` drops out of the table on a
 * lock, the declaration it falls back to.
 */
export function handoverScreenOpen(items: readonly ActionBarItem[]): boolean {
	return offers(items, "handover") || offers(items, "declare_delivered");
}

/** The detail screen's pointer to the fallbacks once the code is locked. */
export function lockedHandoverNotice(
	order: Pick<OrderView, "handover">,
	items: readonly ActionBarItem[],
): boolean {
	return (
		!offers(items, "handover") &&
		offers(items, "declare_delivered") &&
		(order.handover.locked || order.handover.attemptsLeft <= 0)
	);
}

export function initialShopOrderTab(
	param: string | string[] | undefined,
): ShopOrderTab {
	const value = Array.isArray(param) ? param[0] : param;
	return SHOP_ORDER_TABS.find((tab) => tab === value) ?? "to_accept";
}

// --- Reasons --------------------------------------------------------------

/** `SELLER_END_REASONS` in the API's `services/orders/acceptance.ts`. */
export const SELLER_END_REASONS = [
	"seller_out_of_stock",
	"seller_cannot_deliver",
	"seller_buyer_unreachable",
	"seller_other",
] as const satisfies readonly SellerEndReason[];

export const SELLER_END_REASON_KEYS: Record<SellerEndReason, string> = {
	seller_out_of_stock: "sellerOrders.reason_seller_out_of_stock",
	seller_cannot_deliver: "sellerOrders.reason_seller_cannot_deliver",
	seller_buyer_unreachable: "sellerOrders.reason_seller_buyer_unreachable",
	seller_other: "sellerOrders.reason_seller_other",
};

/** The six `deliveryFailure.reason` values `collections/Orders.ts` stores. */
export const DELIVERY_FAILURE_REASONS = [
	"refused",
	"unreachable",
	"absent",
	"address_not_found",
	"timeout",
	"other",
] as const satisfies readonly DeliveryFailureReason[];

export const DELIVERY_FAILURE_REASON_KEYS: Record<
	DeliveryFailureReason,
	string
> = {
	refused: "orderStatus.failure_refused",
	unreachable: "orderStatus.failure_unreachable",
	absent: "orderStatus.failure_absent",
	address_not_found: "orderStatus.failure_address_not_found",
	timeout: "orderStatus.failure_timeout",
	other: "orderStatus.failure_other",
};

const NOTE_MAX = 500;

/** The API refuses `seller_other` without a note (`parseSellerEndReason`). */
export const sellerEndSchema = z
	.object({
		reason: z.enum(SELLER_END_REASONS).nullable(),
		note: z.string().max(NOTE_MAX),
	})
	.superRefine((values, ctx) => {
		if (values.reason === null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["reason"],
				message: "sellerOrders.reasonRequired",
			});
		} else if (values.reason === "seller_other" && !values.note.trim()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["note"],
				message: "sellerOrders.noteRequired",
			});
		}
	});
export type SellerEndValues = z.infer<typeof sellerEndSchema>;

export const deliveryFailureSchema = z
	.object({
		reason: z.enum(DELIVERY_FAILURE_REASONS).nullable(),
		note: z.string().max(NOTE_MAX),
	})
	.superRefine((values, ctx) => {
		if (values.reason === null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["reason"],
				message: "sellerOrders.reasonRequired",
			});
		}
	});
export type DeliveryFailureValues = z.infer<typeof deliveryFailureSchema>;

export const declareDeliveredSchema = z.object({
	note: z.string().max(NOTE_MAX),
	photo: z.string().nullable(),
});
export type DeclareDeliveredValues = z.infer<typeof declareDeliveredSchema>;

/** The routes refuse an empty note, so an empty one is sent as none. */
export function optionalNote(note: string): string | undefined {
	const trimmed = note.trim();
	return trimmed === "" ? undefined : trimmed;
}

function withNote<T extends object>(body: T, note: string) {
	const trimmed = optionalNote(note);
	return trimmed ? { ...body, note: trimmed } : body;
}

export function sellerEndBody(
	values: SellerEndValues,
): { reason: SellerEndReason; note?: string } | null {
	return values.reason
		? withNote({ reason: values.reason }, values.note)
		: null;
}

export function deliveryFailureBody(
	values: DeliveryFailureValues,
): { reason: DeliveryFailureReason; note?: string } | null {
	return values.reason
		? withNote({ reason: values.reason }, values.note)
		: null;
}

// --- Row decorations ------------------------------------------------------

export const TIER_LABEL_KEYS: Record<BuyerTier, string> = {
	new: "sellerOrders.tierNew",
	regular: "sellerOrders.tierRegular",
	trusted: "sellerOrders.tierTrusted",
	watch: "sellerOrders.tierWatch",
	blocked: "sellerOrders.tierBlocked",
};

export function tierTone(tier: BuyerTier): "good" | "neutral" | "warning" {
	if (tier === "trusted" || tier === "regular") return "good";
	if (tier === "watch" || tier === "blocked") return "warning";
	return "neutral";
}

const URGENT_HOURS = 6;

export type Countdown =
	| { expired: true }
	| { expired: false; hours: number; minutes: number; urgent: boolean };

/** Time left to accept, rounded down to the minute; `null` when unbounded. */
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
	const hours = Math.floor(totalMinutes / 60);
	return {
		expired: false,
		hours,
		minutes: totalMinutes % 60,
		urgent: hours < URGENT_HOURS,
	};
}

/** The countdown only means something while the order still waits on the shop. */
export function rowAcceptBy(
	entry: Pick<OrderListEntry, "status" | "acceptBy">,
): string | null {
	if (!entry.acceptBy) return null;
	return TAB_STATUSES.to_accept.includes(entry.status) ? entry.acceptBy : null;
}

// --- Reaching the buyer ---------------------------------------------------

/** No call for a number the API masked: there is nothing left to dial. */
export function callHref(delivery: OrderDeliveryView): string | null {
	if (delivery.phoneMasked) return null;
	return telLink(delivery.phone);
}

/** Districts are `"city.district"` keys, with `districtOther` for "other". */
export function districtLabel(delivery: OrderDeliveryView): string {
	if (delivery.districtOther) return delivery.districtOther;
	const tail = delivery.district.split(".").pop() ?? "";
	if (!tail || tail === "other") return "";
	return tail
		.split(/[-_]/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/** The GPS pin when shared, else the landmark with its district and city. */
export function mapsUrl(delivery: OrderDeliveryView): string | null {
	const base = "https://www.google.com/maps/search/?api=1&query=";
	if (delivery.gps) return `${base}${delivery.gps.lat},${delivery.gps.lng}`;
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
