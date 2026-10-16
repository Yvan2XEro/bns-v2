import { z } from "zod";
import {
	availableActions,
	type OrderAction,
	type OrderActionSubject,
} from "~/lib/order-actions";
import type { OrderStatusName } from "~/lib/order-status";
import type { OrderListEntry, OrderTimelineEntry } from "~/types/order";
import {
	type PaymentPill,
	paymentPill,
} from "../../../../../api/src/contracts/orderPayment";

export const PURCHASE_TABS = ["open", "delivered", "cancelled"] as const;
export type PurchaseTab = (typeof PURCHASE_TABS)[number];

export const PURCHASE_TAB_LABEL_KEYS: Record<PurchaseTab, string> = {
	open: "tabOpen",
	delivered: "tabDelivered",
	cancelled: "tabCancelled",
};

/** The buyer's words for each payment pill: « Paiement à la livraison », « Payé », « Remboursé »… */
export const PURCHASE_PAYMENT_KEYS: Record<PaymentPill, string> = {
	cod: "cardPaymentCod",
	codCollected: "cardPaymentCodCollected",
	codRefused: "cardPaymentCodRefused",
	paid: "cardPaymentPaid",
	awaiting: "cardPaymentAwaiting",
	refunded: "cardPaymentRefunded",
	failed: "cardPaymentFailed",
};

export function purchasePaymentKey(
	entry: Pick<OrderListEntry, "paymentMethod" | "paymentStatus">,
): string | null {
	const pill = paymentPill(entry);
	return pill ? PURCHASE_PAYMENT_KEYS[pill] : null;
}

/**
 * `GET /api/orders` filters on one status at a time, and each tab spans
 * several, so the list is fetched unfiltered and partitioned here. A dispute
 * stays "open" from the buyer's side: nothing about it is settled yet.
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

/**
 * The two values `cancelBuyerOrder` stores (`BUYER_CANCEL_REASONS` in the
 * API's `acceptance.ts`); it answers `order.reasonRequired` to anything else.
 */
export const BUYER_CANCEL_REASONS = [
	{ value: "buyer_changed_mind", labelKey: "cancelReason_changedMind" },
	{
		value: "buyer_ordered_by_mistake",
		labelKey: "cancelReason_orderedByMistake",
	},
] as const;

export const cancelSchema = z.object({
	reason: z.enum(["buyer_changed_mind", "buyer_ordered_by_mistake"]),
});
export type CancelValues = z.infer<typeof cancelSchema>;

export const confirmCodeSchema = z.object({
	code: z.string().regex(/^\d{6}$/),
});
export type ConfirmCodeValues = z.infer<typeof confirmCodeSchema>;

export const contestSchema = z.object({
	note: z.string().trim().max(500),
});
export type ContestValues = z.infer<typeof contestSchema>;

export const reviewSchema = z.object({
	rating: z.coerce.number().int().min(1).max(5),
	comment: z.string().trim().max(2000),
});
export type ReviewInput = z.input<typeof reviewSchema>;
export type ReviewValues = z.output<typeof reviewSchema>;

export const withdrawalSchema = z.object({
	items: z
		.array(
			z
				.object({
					orderItemId: z.string().min(1),
					quantity: z.coerce.number().int().min(0),
					max: z.number().int().min(1),
				})
				.refine((item) => item.quantity <= item.max, {
					path: ["quantity"],
				}),
		)
		.refine((items) => items.some((item) => item.quantity > 0)),
	reasonText: z.string().trim().max(2000).optional(),
});
export type WithdrawalInput = z.input<typeof withdrawalSchema>;
export type WithdrawalValues = z.output<typeof withdrawalSchema>;

export function withdrawalPayload(values: WithdrawalValues) {
	return {
		items: values.items
			.filter((item) => item.quantity > 0)
			.map(({ orderItemId, quantity }) => ({ orderItemId, quantity })),
		reasonText: values.reasonText ? values.reasonText : null,
	};
}

/** Every `ORDER_EVENT_TYPES` entry, plus the three reserved for P5/P6. */
export const TIMELINE_LABEL_KEYS: Record<string, string> = {
	"order.placed": "event_placed",
	"order.receipt_sent": "event_receipt_sent",
	"order.confirmation_code_sent": "event_confirmation_code_sent",
	"order.confirmed": "event_confirmed",
	"order.accepted": "event_accepted",
	"order.declined": "event_declined",
	"order.accept_reminder_sent": "event_accept_reminder_sent",
	"order.shipped": "event_shipped",
	"order.handover_code_sent": "event_handover_code_sent",
	"order.handover_code_regenerated": "event_handover_code_regenerated",
	"order.handover_failed_attempt": "event_handover_failed_attempt",
	"order.handover_locked": "event_handover_locked",
	"order.delivery_attempt_failed": "event_delivery_attempt_failed",
	"order.delivered": "event_delivered",
	"order.delivery_contested": "event_delivery_contested",
	"order.delivery_failed": "event_delivery_failed",
	"order.cancelled": "event_cancelled",
	"order.withdrawal_requested": "event_withdrawal_requested",
	"order.completed": "event_completed",
	"order.commission_accrued": "event_commission_accrued",
	"order.note_added": "event_note_added",
	"order.paid": "event_paid",
	"order.disputed": "event_disputed",
	"order.returned": "event_returned",
};

export function timelineLabelKey(type: OrderTimelineEntry["type"]): string {
	return TIMELINE_LABEL_KEYS[type] ?? "event_other";
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

/**
 * The regenerate button is whatever `availableActions` says, never a reading
 * of `regenerationsLeft` here. The fallbacks are spelled out whenever the
 * code is locked: confirming receipt, or the seller's own declaration, both
 * finish a delivery the code no longer can.
 */
export function handoverCardState(
	order: OrderActionSubject,
	actions: readonly OrderAction[],
) {
	return {
		locked: order.handover.locked,
		regenerationsLeft: order.handover.regenerationsLeft,
		canRegenerate: actions.includes("regenerate_handover_code"),
		showFallbacks: order.handover.locked,
	};
}

/**
 * The API answers a whole document whose `<style>` targets `body` — inlined
 * as is, it would restyle the site around it. Only its body is kept; the
 * page styles it within its own container.
 */
export function receiptBody(html: string): string {
	const match = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
	return match ? match[1].trim() : html;
}

export type PurchaseListItem =
	| { kind: "order"; entry: OrderListEntry }
	| { kind: "group"; checkoutGroup: string; entries: OrderListEntry[] };

/**
 * Siblings of one split checkout collapse under a single header, placed where
 * the group's first order sits. A group seen with one order on this tab still
 * renders as a plain row.
 */
export function groupPurchases(
	entries: readonly OrderListEntry[],
): PurchaseListItem[] {
	const items: PurchaseListItem[] = [];
	const groups = new Map<string, OrderListEntry[]>();
	for (const entry of entries) {
		const key = entry.checkoutGroup;
		if (!key) {
			items.push({ kind: "order", entry });
			continue;
		}
		const siblings = groups.get(key);
		if (siblings) {
			siblings.push(entry);
			continue;
		}
		const created = [entry];
		groups.set(key, created);
		items.push({ kind: "group", checkoutGroup: key, entries: created });
	}
	return items.map((item) =>
		item.kind === "group" && item.entries.length === 1
			? { kind: "order", entry: item.entries[0] as OrderListEntry }
			: item,
	);
}

export type PurchaseCardActionKind =
	| "confirm"
	| "track"
	| "track_courier"
	| "review"
	| "return";

export interface PurchaseCardAction {
	kind: PurchaseCardActionKind;
	/** The order page, at the panel that carries the action. */
	href: string;
}

/** Statuses still moving towards the buyer; a dispute is open but not travelling. */
const TRACKABLE: ReadonlySet<OrderStatusName> = new Set([
	"placed",
	"confirmed",
	"paid",
	"accepted",
	"shipped",
]);

/**
 * A list card's shortcuts, read off the same `availableActions` the order
 * page renders, so a card never offers what the page (and the API) would
 * refuse. Every shortcut opens the order page, where the action itself runs.
 * A row from an API that does not send `actionSubject` yet only gets the
 * tracking link, which needs nothing but the status.
 */
export function purchaseCardActions(
	entry: OrderListEntry,
	now: Date,
): PurchaseCardAction[] {
	const page = `/purchases/${encodeURIComponent(entry.id)}`;
	const actions = entry.actionSubject
		? availableActions(
				{ ...entry.actionSubject, status: entry.status },
				"buyer",
				null,
				now,
			)
		: [];
	const out: PurchaseCardAction[] = [];
	if (actions.includes("confirm_code")) {
		out.push({ kind: "confirm", href: page });
	} else if (TRACKABLE.has(entry.status)) {
		const courier =
			entry.status === "shipped" && entry.arrival?.method === "courier";
		out.push({
			kind: courier ? "track_courier" : "track",
			href: `${page}#tracking`,
		});
	}
	if (actions.includes("review_shop"))
		out.push({ kind: "review", href: `${page}#review` });
	if (actions.includes("request_withdrawal"))
		out.push({ kind: "return", href: `${page}#withdrawal` });
	return out;
}

export type PurchaseArrival =
	| { kind: "promised"; at: string }
	| { kind: "eta"; text: string }
	| { kind: "returnUntil"; at: string };

/**
 * The card's time line: the promised arrival while the order travels (the
 * shop's own estimate when no date was promised), and the return deadline
 * once a return can still be asked for.
 */
export function purchaseArrival(
	entry: OrderListEntry,
	actions: readonly PurchaseCardAction[],
): PurchaseArrival | null {
	if (TRACKABLE.has(entry.status) && entry.arrival) {
		if (entry.arrival.promisedBy)
			return { kind: "promised", at: entry.arrival.promisedBy };
		if (entry.arrival.etaText)
			return { kind: "eta", text: entry.arrival.etaText };
		return null;
	}
	const until = entry.actionSubject?.deadlines.withdrawalUntil;
	if (until && actions.some((action) => action.kind === "return"))
		return { kind: "returnUntil", at: until };
	return null;
}
