/**
 * The order events the API posts into an order conversation
 * (`SYSTEM_MESSAGE_EVENTS` in `api/src/services/orders/chat.ts`, compared in
 * the API's parity specs) and the `messages` key each one renders as. An
 * event missing here still renders, from the message's French `content`,
 * which is what an old app build shows.
 */
export const SYSTEM_EVENT_KEYS = {
	"order.placed": "messages.system_order_placed",
	"order.confirmed": "messages.system_order_confirmed",
	"order.accepted": "messages.system_order_accepted",
	"order.declined": "messages.system_order_declined",
	"order.shipped": "messages.system_order_shipped",
	"order.delivered": "messages.system_order_delivered",
	"order.cancelled": "messages.system_order_cancelled",
	"order.delivery_failed": "messages.system_order_delivery_failed",
	"order.withdrawal_requested": "messages.system_order_withdrawal_requested",
	"order.completed": "messages.system_order_completed",
} as const;

export type SystemEventKey =
	(typeof SYSTEM_EVENT_KEYS)[keyof typeof SYSTEM_EVENT_KEYS];

export interface SystemMessageLike {
	kind?: string | null;
	systemEvent?: string | null;
	systemParams?: unknown;
	content?: string | null;
	order?: string | { id: string } | null;
}

export type SystemChip =
	| { kind: "key"; key: SystemEventKey; orderNumber: string }
	| { kind: "text"; text: string };

export function isSystemMessage(message: SystemMessageLike): boolean {
	return message.kind === "system";
}

function isKnownEvent(
	event: string | null | undefined,
): event is keyof typeof SYSTEM_EVENT_KEYS {
	return typeof event === "string" && Object.hasOwn(SYSTEM_EVENT_KEYS, event);
}

function orderNumberOf(message: SystemMessageLike): string | null {
	const params = message.systemParams;
	if (typeof params !== "object" || params === null) return null;
	const value = (params as { orderNumber?: unknown }).orderNumber;
	return typeof value === "string" && value.length > 0 ? value : null;
}

/** What a system message's centred chip says: a localised key when it can, its stored text otherwise. */
export function systemChip(message: SystemMessageLike): SystemChip {
	const orderNumber = orderNumberOf(message);
	if (isKnownEvent(message.systemEvent) && orderNumber) {
		return {
			kind: "key",
			key: SYSTEM_EVENT_KEYS[message.systemEvent],
			orderNumber,
		};
	}
	return { kind: "text", text: message.content ?? "" };
}

/**
 * The order screen a chip opens, from the side the viewer is on. Null when
 * the message carries no order (an older system message).
 */
export function systemMessageOrderPath(
	message: SystemMessageLike,
	side: "buyer" | "shop",
): `/purchases/${string}` | `/seller/orders/${string}` | null {
	if (!isSystemMessage(message) || !message.order) return null;
	const orderId =
		typeof message.order === "string" ? message.order : message.order.id;
	if (!orderId) return null;
	const id = encodeURIComponent(orderId);
	return side === "buyer" ? `/purchases/${id}` : `/seller/orders/${id}`;
}
