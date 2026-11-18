import { z } from "zod";

/**
 * The order events the API posts into an order conversation
 * (`SYSTEM_MESSAGE_EVENTS` in `api/src/services/orders/chat.ts`) and the
 * `Messages` key each one renders as. An event missing here still renders,
 * from the message's French `content`, which is what an old payload carries.
 */
export const SYSTEM_EVENT_KEYS = {
	"order.placed": "system_order_placed",
	"order.confirmed": "system_order_confirmed",
	"order.accepted": "system_order_accepted",
	"order.declined": "system_order_declined",
	"order.shipped": "system_order_shipped",
	"order.delivered": "system_order_delivered",
	"order.cancelled": "system_order_cancelled",
	"order.delivery_failed": "system_order_delivery_failed",
	"order.withdrawal_requested": "system_order_withdrawal_requested",
	"order.completed": "system_order_completed",
} as const;

export type SystemEventKey =
	(typeof SYSTEM_EVENT_KEYS)[keyof typeof SYSTEM_EVENT_KEYS];

export interface SystemMessageLike {
	kind?: "user" | "system" | null;
	systemEvent?: string | null;
	systemParams?: unknown;
	content: string;
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

const chipParams = z.object({ orderNumber: z.string().min(1) });

function paramsOf(message: SystemMessageLike) {
	const parsed = chipParams.safeParse(message.systemParams);
	return parsed.success ? parsed.data : null;
}

/** What a system message's centred chip says: a localised key when it can, its stored text otherwise. */
export function systemChip(message: SystemMessageLike): SystemChip {
	const params = paramsOf(message);
	if (isKnownEvent(message.systemEvent) && params) {
		return {
			kind: "key",
			key: SYSTEM_EVENT_KEYS[message.systemEvent],
			orderNumber: params.orderNumber,
		};
	}
	return { kind: "text", text: message.content };
}

export interface OrderCard {
	orderId: string;
	orderNumber: string | null;
	href: string;
}

/**
 * The order a conversation is about, read off its system messages (each one
 * carries the order), so the thread needs no second request. The latest one
 * wins: a buyer who orders twice from one shop keeps one thread.
 */
export function orderCardOf(
	messages: readonly SystemMessageLike[],
	side: "buyer" | "shop",
): OrderCard | null {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (!isSystemMessage(message) || !message.order) continue;
		const orderId =
			typeof message.order === "string" ? message.order : message.order.id;
		const path = side === "buyer" ? "/purchases" : "/seller/orders";
		return {
			orderId,
			orderNumber: paramsOf(message)?.orderNumber ?? null,
			href: `${path}/${encodeURIComponent(orderId)}`,
		};
	}
	return null;
}
