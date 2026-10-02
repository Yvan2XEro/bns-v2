import type { Payload, PayloadRequest } from "payload";
import { INBOX_SERVICE_CONTEXT } from "../../collections/Conversations";
import { ORDER_SERVICE_CONTEXT } from "../../collections/Orders";
import { queueSystemMessage } from "../../hooks/systemMessageEvents";
import { ERROR_CODES } from "../../lib/errors";
import { formatXaf } from "../../lib/orderFormat";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import type {
	Conversation,
	Message,
	Order,
	OrderEvent,
	OrderItem,
} from "../../payload-types";
import { registerOrderEventHandler } from "./events";

/**
 * The spec's ten events that get a line in the order conversation. `order.paid`
 * (P5) and `order.disputed`/`order.returned` (P6) are deliberately absent —
 * this phase does not speak for a status it does not write — and the eleven
 * other P4 event types (code sent, reminder sent, note added, …) are
 * operational detail nobody but staff needs to see in a thread the buyer
 * reads too.
 */
export const SYSTEM_MESSAGE_EVENTS = [
	"order.placed",
	"order.confirmed",
	"order.accepted",
	"order.declined",
	"order.shipped",
	"order.delivered",
	"order.cancelled",
	"order.delivery_failed",
	"order.withdrawal_requested",
	"order.completed",
] as const satisfies readonly OrderEvent["type"][];

export type SystemMessageEvent = (typeof SYSTEM_MESSAGE_EVENTS)[number];

function isSystemMessageEvent(type: string): type is SystemMessageEvent {
	return (SYSTEM_MESSAGE_EVENTS as readonly string[]).includes(type);
}

/**
 * The French line an old, pre-i18n app build renders verbatim as the message
 * bubble. Never the event's `reason` (a moderation code, not shipping copy)
 * and never anything from `order.confirmation`/`order.handover` — this is the
 * one place the design doc requires French only; a localised chip for new
 * clients is Tasks 35/41's, built from `systemEvent` and `systemParams`.
 */
const SYSTEM_MESSAGE_CONTENT: Record<
	SystemMessageEvent,
	(orderNumber: string, total: number) => string
> = {
	"order.placed": (orderNumber, total) =>
		`Commande ${orderNumber} enregistrée, total ${formatXaf(total, "fr")}.`,
	"order.confirmed": (orderNumber) => `Commande ${orderNumber} confirmée.`,
	"order.accepted": (orderNumber) =>
		`La boutique a accepté la commande ${orderNumber}.`,
	"order.declined": (orderNumber) =>
		`La boutique a refusé la commande ${orderNumber}.`,
	"order.shipped": (orderNumber) => `Commande ${orderNumber} expédiée.`,
	"order.delivered": (orderNumber) => `Commande ${orderNumber} livrée.`,
	"order.cancelled": (orderNumber) => `Commande ${orderNumber} annulée.`,
	"order.delivery_failed": (orderNumber) =>
		`La livraison de la commande ${orderNumber} a échoué.`,
	"order.withdrawal_requested": (orderNumber) =>
		`Le client a demandé le retrait de la commande ${orderNumber}.`,
	"order.completed": (orderNumber) => `Commande ${orderNumber} terminée.`,
};

/**
 * Structured data for the localised chip (Tasks 35, 41). Whitelisted rather
 * than forwarded from `event.metadata`: `assertNoSecretsInMetadata` already
 * keeps a code or hash out of that object, but this is the layer the thread
 * is actually readable from, so it never trusts the event's own object
 * wholesale — only the four fields a chip needs.
 */
function systemParamsOf(
	order: Order,
	event: OrderEvent,
): Record<string, unknown> {
	return {
		orderNumber: order.orderNumber,
		total: order.amounts?.total ?? null,
		statusFrom: event.statusFrom ?? null,
		statusTo: event.statusTo ?? null,
		reason: event.reason ?? null,
	};
}

function contentFor(type: SystemMessageEvent, order: Order): string {
	return SYSTEM_MESSAGE_CONTENT[type](
		order.orderNumber,
		order.amounts?.total ?? 0,
	);
}

async function findOrderConversation(
	req: PayloadRequest,
	orderId: string,
): Promise<Conversation | null> {
	const existing = await req.payload.find({
		collection: "conversations",
		where: { order: { equals: orderId } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return (existing.docs[0] as Conversation | undefined) ?? null;
}

/**
 * Creates the order's conversation, or returns the one already there.
 * Idempotent on `conversations.order` so a second `order.placed` dispatch —
 * a replayed event, not merely a retried one; the registry's own dedup
 * (Task 8) already closes that door — reuses the thread instead of forking
 * it. `shop`, `buyer`, `participants` and `order` are written through
 * `INBOX_SERVICE_CONTEXT`, the same flag `services/inbox.ts` uses, which is
 * what lets this call skip `Conversations.beforeChange`'s participant check:
 * there is no `req.user` here to satisfy it with.
 */
export async function createOrderConversation(
	req: PayloadRequest,
	order: Order,
): Promise<Conversation> {
	const orderId = String(order.id);
	const found = await findOrderConversation(req, orderId);
	if (found) return found;

	const shopId = relationId(order.shop);
	if (!shopId) {
		throw new ServiceError(
			ERROR_CODES.server,
			500,
			`order ${order.orderNumber} has no shop to open a conversation for`,
		);
	}

	const [shop, items] = await Promise.all([
		req.payload.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
			req,
		}),
		req.payload.find({
			collection: "order-items",
			where: { order: { equals: orderId } },
			sort: "lineNumber",
			limit: 1,
			depth: 0,
			overrideAccess: true,
			req,
		}),
	]);

	const ownerId = relationId(shop.owner);
	const buyerId = relationId(order.buyer);
	const firstItem = items.docs[0] as OrderItem | undefined;
	const listingId = firstItem ? relationId(firstItem.listing) : null;

	// `[buyer, owner]` only: every other shop member reaches the thread
	// through P3's inbox membership, never through `participants` — so
	// revoking a member never has to rewrite this document.
	const participants = [buyerId, ownerId].filter(
		(id): id is string => id !== null,
	);

	return (await req.payload.create({
		collection: "conversations",
		req,
		overrideAccess: true,
		context: INBOX_SERVICE_CONTEXT,
		data: {
			participants,
			shop: shopId,
			buyer: buyerId,
			order: orderId,
			listing: listingId,
			inboxStatus: "open",
			awaitingReply: false,
		},
	})) as Conversation;
}

/**
 * Posts a system message for `event` into the order's conversation, and
 * publishes it on `chat:system` once the write is durable. Returns `null`
 * for an event outside `SYSTEM_MESSAGE_EVENTS` or when no conversation
 * exists yet, so a caller cannot be fooled into thinking something was
 * posted.
 *
 * Uses the given `req` directly rather than opening a transaction of its
 * own: `queueSystemMessage` defers to `onCommit` against whatever scope
 * `req` carries, exactly like `queueSearchEvent`, so a caller inside
 * `withTransaction` gets a deferred publish and a caller past commit (the
 * registered handler below) gets an immediate one — both correct for where
 * they stand relative to the write.
 */
export async function postOrderSystemMessage(
	req: PayloadRequest,
	order: Order,
	event: OrderEvent,
): Promise<Message | null> {
	if (!isSystemMessageEvent(event.type)) return null;

	const conversation = await findOrderConversation(req, String(order.id));
	if (!conversation) return null;

	const content = contentFor(event.type, order);
	const systemParams = systemParamsOf(order, event);

	const message = (await req.payload.create({
		collection: "messages",
		req,
		overrideAccess: true,
		context: ORDER_SERVICE_CONTEXT,
		data: {
			conversation: conversation.id,
			kind: "system",
			sender: null,
			content,
			systemEvent: event.type,
			systemParams,
			order: order.id,
		},
	})) as Message;

	await queueSystemMessage(req, {
		type: "order.system_message",
		conversationId: String(conversation.id),
		messageId: String(message.id),
		kind: "system",
		systemEvent: event.type,
		systemParams,
		content,
		createdAt: String(message.createdAt),
	});

	return message;
}

/**
 * `runOrderEventHandlers` (Task 8) hands a handler `payload`, not `req` — by
 * design, since every handler runs after the transition's own transaction
 * has already committed, so there is nothing left to join. `onCommit` sees
 * no queued scope on this shape and runs `queueSystemMessage`'s publish
 * immediately, which is exact here: the commit it would otherwise wait for
 * has already happened.
 */
function requestFrom(payload: Payload): PayloadRequest {
	return { payload, context: {} } as unknown as PayloadRequest;
}

async function handleOrderEvent(
	payload: Payload,
	order: Order,
	event: OrderEvent,
): Promise<void> {
	const req = requestFrom(payload);
	if (event.type === "order.placed") {
		await createOrderConversation(req, order);
	}
	await postOrderSystemMessage(req, order, event);
}

/**
 * Registers `handleOrderEvent` for each of the ten events. Exported, not
 * just run as a module-load side effect, so a test that calls Task 8's
 * `__resetOrderEventHandlers()` — which clears the handler map along with
 * the dispatch log — has a real way back in, rather than needing a second
 * import of this module (which `require`/`import` caching would not give
 * it) or a hand-rolled stand-in that drifts from what production actually
 * registers.
 */
export function registerOrderChatHandlers(): void {
	for (const type of SYSTEM_MESSAGE_EVENTS) {
		registerOrderEventHandler(type, handleOrderEvent);
	}
}

// Run once per process load: a retried transition reaches `handleOrderEvent`
// through `queueOrderEvent` -> `runOrderEventHandlers`, whose own dispatch
// log (keyed by `OrderEvent.id`) is what keeps a replay from posting the
// line twice. Posting from inside `applyTransition` instead would have no
// such guard.
registerOrderChatHandlers();
