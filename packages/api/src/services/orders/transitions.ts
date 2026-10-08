import type { PayloadRequest, Where } from "payload";
import { ORDER_EVENT_TYPES as P4_ORDER_EVENT_TYPES } from "../../collections/OrderEvents";
import { ORDER_ITEM_FULFILLMENT_STATUSES } from "../../collections/OrderItems";
import {
	ORDER_PAYMENT_STATUSES,
	ORDER_SERVICE_CONTEXT,
} from "../../collections/Orders";
import { ERROR_CODES } from "../../lib/errors";
import { ORDER_STATUS_NAMES } from "../../lib/orderFormat";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import type { Order, OrderEvent, OrderItem } from "../../payload-types";
import { queueOrderEvent } from "./events";

export type OrderStatus = Order["status"];
export type PaymentStatus = Order["paymentStatus"];
export type FulfillmentStatus = OrderItem["fulfillmentStatus"];

/** The one list (`lib/orderFormat.ts`), re-exported so transitions and
 * display share a single source of truth. */
export { ORDER_STATUS_NAMES } from "../../lib/orderFormat";
export const PAYMENT_STATUS_NAMES = ORDER_PAYMENT_STATUSES;
export const FULFILLMENT_STATUS_NAMES = ORDER_ITEM_FULFILLMENT_STATUSES;

/**
 * The spec's `status` table (`docs/superpowers/specs/2026-09-15-p4-cod-orders-design.md`,
 * "State machines"), transcribed row for row, including the rows P5 and P6
 * own. The table says a transition is *structurally* possible; it does not
 * say which phase may ask for it — `assertStatusAuthority` below is the
 * separate guard for that, because collapsing the two into one table is
 * exactly how a P4 caller would end up writing a P6 status.
 */
export const STATUS_TRANSITIONS: Record<
	OrderStatus | "none",
	readonly OrderStatus[]
> = {
	none: ["placed"],
	placed: ["confirmed", "paid", "cancelled"],
	confirmed: ["accepted", "cancelled"],
	paid: ["accepted", "cancelled"],
	accepted: ["shipped", "cancelled"],
	shipped: ["delivered", "delivery_failed", "cancelled", "disputed"],
	delivered: ["completed", "returned", "disputed"],
	completed: [],
	cancelled: [],
	delivery_failed: [],
	returned: [],
	disputed: ["shipped", "delivered", "returned", "cancelled"],
};

/** The spec's `paymentStatus` table, same section. */
export const PAYMENT_TRANSITIONS: Record<
	PaymentStatus | "none",
	readonly PaymentStatus[]
> = {
	none: ["cod_pending", "unpaid"],
	unpaid: ["awaiting_payment", "failed"],
	awaiting_payment: ["paid", "failed"],
	paid: ["refunded", "partially_refunded"],
	cod_pending: ["cod_collected", "cod_refused", "unpaid"],
	cod_collected: ["refunded", "partially_refunded"],
	partially_refunded: ["refunded", "partially_refunded"],
	cod_refused: [],
	refunded: [],
	failed: [],
};

/** The spec's item `fulfillmentStatus` table, same section. */
export const FULFILLMENT_TRANSITIONS: Record<
	FulfillmentStatus | "none",
	readonly FulfillmentStatus[]
> = {
	none: [],
	unfulfilled: ["shipped", "cancelled"],
	shipped: ["delivered", "failed"],
	delivered: ["return_requested"],
	return_requested: ["returned", "delivered"],
	failed: [],
	cancelled: [],
	returned: [],
};

/** No outgoing `status` row — P6's own transitions out of `disputed` are the
 * only way past them. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = [
	"completed",
	"cancelled",
	"delivery_failed",
	"returned",
];

/** `paid` is P5's to write; `returned` and `disputed` are P6's. The table
 * above still carries their rows — structural validity — so that a P4
 * transition landing *next to* one (`delivered → completed` beside
 * `delivered → returned`) is checked against the real shape of the machine,
 * not a P4-only subset of it. P5 has since opened `paid`'s three rows
 * (`UNRESERVED_TRANSITIONS`); the status stays listed so that any row added
 * through it later is reserved until someone opens it on purpose. */
export const RESERVED_STATUSES: readonly OrderStatus[] = [
	"paid",
	"returned",
	"disputed",
];

export const P4_WRITABLE_STATUSES: readonly OrderStatus[] =
	ORDER_STATUS_NAMES.filter((status) => !RESERVED_STATUSES.includes(status));

/**
 * Set by a P5 or P6 service on the `req` it passes into `applyTransition`,
 * for the one call where it legitimately writes a status this phase does
 * not implement. Without it, a `status` naming or touching a reserved value
 * — on either side of the transition — is refused exactly like a transition
 * absent from the table, because the caller's phase is what authorises a
 * reserved row, not the table.
 */
export const RESERVED_TRANSITION_CONTEXT = {
	orderReservedTransition: true,
} as const;

/**
 * P5 is implemented, so its rows through `paid` are no longer reserved: a
 * settled payment moves `placed → paid`, and a paid order is accepted or
 * cancelled by the same flows as a confirmed one. Exactly these three; every
 * other row touching a reserved status still needs the context flag.
 */
export const UNRESERVED_TRANSITIONS: ReadonlyArray<
	readonly [OrderStatus, OrderStatus]
> = [
	["placed", "paid"],
	["paid", "accepted"],
	["paid", "cancelled"],
];

function isUnreserved(from: OrderStatus, to: OrderStatus): boolean {
	return UNRESERVED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

function isReserved(status: OrderStatus): boolean {
	return RESERVED_STATUSES.includes(status);
}

function assertStatusAuthority(
	req: PayloadRequest,
	from: OrderStatus,
	to: OrderStatus,
): void {
	if (!isReserved(from) && !isReserved(to)) return;
	if (isUnreserved(from, to)) return;
	if (req.context?.orderReservedTransition === true) return;
	throw new ServiceError(
		ERROR_CODES.orderInvalidTransition,
		409,
		`"${to}" is reserved for a later phase and cannot be written here`,
	);
}

/** P4's 21 own event types (Task 6), plus the 3 the spec names but reserves
 * for P5 (`order.paid`) and P6 (`order.disputed`, `order.returned`) — never
 * written by this phase, but part of the one vocabulary a handler registered
 * against `ORDER_EVENT_TYPES` can be checked against. */
export const RESERVED_ORDER_EVENT_TYPES = [
	"order.paid",
	"order.disputed",
	"order.dispute_withdrawn",
	"order.returned",
] as const;

export const ORDER_EVENT_TYPES: readonly string[] = [
	...P4_ORDER_EVENT_TYPES,
	...RESERVED_ORDER_EVENT_TYPES,
];

/**
 * Pure: no `from`/`to` pair outside `table[from]` is ever allowed, whatever
 * `from` is. The exported entry point so a reviewer — and Task 20's own test
 * — can check a single transition against a table without going through a
 * whole `applyTransition` call.
 */
export function assertTransition<T extends string>(
	from: T | "none",
	to: T,
	table: Record<T | "none", readonly T[]>,
): void {
	if (!table[from]?.includes(to)) {
		throw new ServiceError(
			ERROR_CODES.orderInvalidTransition,
			409,
			`cannot move from "${from}" to "${to}"`,
		);
	}
}

/** Matches `code`, `hash`, `secret` or `otp` in a metadata key, case
 * insensitive — the write-time backstop so an event can describe sending a
 * code without ever storing the value (P3's `assertNoCostLeak` precedent). */
const SECRET_METADATA_KEY = /code|hash|secret|otp/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertNoSecretsInMetadata(metadata: unknown): void {
	if (!isPlainObject(metadata)) return;
	const leaked = Object.keys(metadata).filter((key) =>
		SECRET_METADATA_KEY.test(key),
	);
	if (leaked.length > 0) {
		throw new Error(
			`order-events: metadata must not carry a code or hash field (${leaked.join(", ")})`,
		);
	}
}

/**
 * `db.updateOne`'s real adapter types its result as an untyped `Document`,
 * so the row this narrows is the authoritative post-write state (mirrors
 * `services/stock.ts`'s `isVariantRow`).
 */
function isOrderRow(row: unknown): row is Order {
	if (typeof row !== "object" || row === null) return false;
	return "id" in row && "status" in row && "paymentStatus" in row;
}

/** Everything `appendOrderEvent` persists besides the generated `id`/`order`/
 * timestamps. Open to `statusFrom`/`statusTo`/`paymentStatusFrom`/
 * `paymentStatusTo` because a caller logging an event with no transition
 * (`order.note_added`) still goes through this same writer. */
export type OrderEventInput = Omit<
	OrderEvent,
	"id" | "order" | "createdAt" | "updatedAt"
>;

/** What `applyTransition`'s caller supplies: the four `*From`/`*To` fields
 * are computed from the transition itself, never handed in, so they are not
 * part of this shape. */
export type TransitionEventInput = Omit<
	OrderEventInput,
	"statusFrom" | "statusTo" | "paymentStatusFrom" | "paymentStatusTo"
>;

/**
 * The only writer of `order-events`. Append-only (Task 6's collection has no
 * `update`/`delete` access at all) and guarded at the write itself, because a
 * guard anywhere else is a guard a second call site can forget.
 */
export async function appendOrderEvent(
	req: PayloadRequest,
	order: Order,
	event: OrderEventInput,
): Promise<OrderEvent> {
	assertNoSecretsInMetadata(event.metadata);
	return req.payload.create({
		collection: "order-events",
		req,
		overrideAccess: true,
		data: { ...event, order: order.id },
	});
}

export interface TransitionRequest {
	status?: OrderStatus;
	paymentStatus?: PaymentStatus;
	items?: { ids: string[]; to: FulfillmentStatus };
	set?: Record<string, unknown>;
}

/**
 * The ONLY writer of `orders.status`, `orders.paymentStatus` and
 * `order-items.fulfillmentStatus`. Three properties make it that:
 *
 *  1. the write is conditional — `db.updateOne` carries `status: { equals:
 *     from }` (and `paymentStatus: { equals: ... }` when that is also
 *     changing), so two members accepting the same order in the same second
 *     produce one winner and one `order.invalidTransition`, and the loser is
 *     handed the state that actually holds now rather than the one it
 *     started from;
 *  2. the event is written in the same transaction as the change, via
 *     `appendOrderEvent` on the same `req` — an event written after the fact
 *     is an event a crash between the two writes would lose, and art. 26
 *     puts the burden of proof on us;
 *  3. nothing it writes is observable outside the transaction — effects
 *     (SMS, Novu, Redis, search) go through `queueOrderEvent`, which defers
 *     to `onCommit` and is called here only after every write above has
 *     succeeded.
 */
export async function applyTransition(
	req: PayloadRequest,
	order: Order,
	request: TransitionRequest,
	event: TransitionEventInput,
): Promise<{ order: Order; event: OrderEvent }> {
	const from = order.status;
	const paymentFrom = order.paymentStatus;

	if (request.status !== undefined) {
		assertTransition(from, request.status, STATUS_TRANSITIONS);
		assertStatusAuthority(req, from, request.status);
	}
	if (request.paymentStatus !== undefined) {
		assertTransition(paymentFrom, request.paymentStatus, PAYMENT_TRANSITIONS);
	}

	const data: Record<string, unknown> = { ...(request.set ?? {}) };
	if (request.status !== undefined) data.status = request.status;
	if (request.paymentStatus !== undefined) {
		data.paymentStatus = request.paymentStatus;
	}

	const where: Where = {
		and: [
			{ id: { equals: String(order.id) } },
			{ status: { equals: from } },
			...(request.paymentStatus !== undefined
				? [{ paymentStatus: { equals: paymentFrom } }]
				: []),
		],
	};

	const updated: unknown = await req.payload.db.updateOne({
		collection: "orders",
		where,
		data,
		req,
		returning: true,
	});

	if (updated === null || updated === undefined) {
		// Someone else moved it between our read and our write. Report the
		// state that holds now, so the caller's UI re-renders rather than
		// guesses from the state it asked for.
		const fresh = await req.payload.findByID({
			collection: "orders",
			id: String(order.id),
			depth: 0,
			overrideAccess: true,
			req,
		});
		throw new ServiceError(
			ERROR_CODES.orderInvalidTransition,
			409,
			`order ${order.orderNumber} is ${String(fresh.status)}, not ${from}`,
			{ status: fresh.status, paymentStatus: fresh.paymentStatus },
		);
	}
	if (!isOrderRow(updated)) {
		throw new ServiceError(
			ERROR_CODES.server,
			500,
			"order update returned an unexpected row",
		);
	}

	const items: Array<{
		orderItem: string;
		fulfillmentFrom: FulfillmentStatus;
		fulfillmentTo: FulfillmentStatus;
	}> = [];

	if (request.items) {
		for (const itemId of request.items.ids) {
			const item = await req.payload.findByID({
				collection: "order-items",
				id: itemId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (relationId(item.order) !== String(order.id)) {
				throw new ServiceError(
					ERROR_CODES.notFound,
					404,
					"order item not found",
				);
			}
			assertTransition(
				item.fulfillmentStatus,
				request.items.to,
				FULFILLMENT_TRANSITIONS,
			);
			await req.payload.update({
				collection: "order-items",
				id: itemId,
				req,
				overrideAccess: true,
				context: ORDER_SERVICE_CONTEXT,
				data: { fulfillmentStatus: request.items.to },
			});
			items.push({
				orderItem: itemId,
				fulfillmentFrom: item.fulfillmentStatus,
				fulfillmentTo: request.items.to,
			});
		}
	}

	const written = await appendOrderEvent(req, updated, {
		...event,
		statusFrom: request.status !== undefined ? from : null,
		statusTo: request.status ?? null,
		paymentStatusFrom: request.paymentStatus !== undefined ? paymentFrom : null,
		paymentStatusTo: request.paymentStatus ?? null,
		items: items.length > 0 ? items : (event.items ?? null),
	});

	// Deferred to after commit: a handler must never see this order before
	// the write it reacts to has actually landed.
	queueOrderEvent(req, updated, written);

	return { order: updated, event: written };
}

/** Run a transition owned by the P5/P6 workflow without granting that
 * authority to unrelated callers sharing the same request. */
export async function applyReservedTransition(
	req: PayloadRequest,
	order: Order,
	request: TransitionRequest,
	event: TransitionEventInput,
): Promise<{ order: Order; event: OrderEvent }> {
	const previousContext = req.context;
	req.context = { ...previousContext, ...RESERVED_TRANSITION_CONTEXT };
	try {
		return await applyTransition(req, order, request, event);
	} finally {
		req.context = previousContext;
	}
}
