import type { Payload, PayloadRequest } from "payload";
import {
	type OrderViewer,
	requireOrderAudience,
} from "../../access/orderAccess";
import type { ShopRole } from "../../access/shopRoles";
import {
	type ORDER_DELIVERY_FAILURE_REASONS,
	ORDER_SERVICE_CONTEXT,
} from "../../collections/Orders";
import { ERROR_CODES } from "../../lib/errors";
import { getOrderSettings } from "../../lib/orderSettings";
import { type CounterStore, hitRateLimit } from "../../lib/rateLimit";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import type { Order, OrderEvent, OrderItem } from "../../payload-types";
import { findVariant, release, sell } from "../stock";
import { queueOrderEvent } from "./events";
import { recordDelivered, recordRefusal } from "./risk";
import { appendOrderEvent, applyTransition } from "./transitions";

/**
 * Three of the seven routes below act for the buyer alone
 * (`confirm-receipt`, `contest-delivery`, `handover-code/regenerate`). A
 * shop member or a moderator calling one is a real audience for the order
 * but not the party this route exists for, and gets the same
 * `order.notFound` a stranger would — the route itself never confirms the
 * order exists to the wrong caller, the same reasoning
 * `requireOrderAudience` already applies to a stranger.
 */
export async function requireOrderBuyer(
	payload: Payload,
	user: OrderViewer | null | undefined,
	orderId: string,
	req?: PayloadRequest,
): Promise<Order> {
	const { order, audience } = await requireOrderAudience(
		payload,
		user,
		orderId,
		req,
	);
	if (audience.kind !== "buyer") {
		throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	}
	return order;
}

export type DeliveryFailureReason =
	(typeof ORDER_DELIVERY_FAILURE_REASONS)[number];
export type HandoverMethod = NonNullable<
	NonNullable<Order["handover"]>["method"]
>;
export type OrderActorType = NonNullable<OrderEvent["actorType"]>;

/** The three reasons art. 26 treats as the buyer's fault — the only ones a
 * failed delivery ever scores against the delivery phone (mirrors
 * `risk.ts`'s own `isScoredRefusal`, kept separate because this file decides
 * `paymentStatus`, not just whether to write a score row). */
const BUYER_FAULT_REASONS: ReadonlySet<DeliveryFailureReason> = new Set([
	"refused",
	"unreachable",
	"absent",
]);

/** The buyer's 48-hour window to contest a seller's declaration (art. 26);
 * see `contestDelivery`. */
const CONTEST_WINDOW_MS = 48 * 60 * 60 * 1000;

async function orderItemsOf(
	req: PayloadRequest,
	order: Order,
): Promise<OrderItem[]> {
	const { docs } = await req.payload.find({
		collection: "order-items",
		where: { order: { equals: order.id } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs as OrderItem[];
}

/**
 * Moves every stock-tracked item of `order` through `mover` (`sell` or
 * `release`), on the variant it was actually ordered against. Both movers
 * alert rather than throw on a failed condition (Task 9), so one item's
 * stale cache never blocks the rest of the order's items or the transition
 * that already committed above it.
 */
async function moveStockFor(
	req: PayloadRequest,
	order: Order,
	items: readonly OrderItem[],
	mover: typeof sell | typeof release,
): Promise<void> {
	for (const item of items) {
		const variantId = relationId(item.variant);
		if (!variantId) continue;
		const variant = await findVariant(req, variantId);
		await mover(req, {
			variant,
			quantity: item.quantity,
			orderId: String(order.id),
			orderRef: order.orderNumber,
		});
	}
}

export interface MarkDeliveredOptions {
	method: HandoverMethod;
	actorType: OrderActorType;
	actor?: string;
	actorShopRole?: ShopRole;
	note?: string;
	photo?: string;
}

/**
 * The one way `shipped` becomes `delivered`, whichever of the three paths
 * got it there (a verified handover code, the buyer's own confirmation, or
 * a seller's declaration). `applyTransition` runs first and alone decides
 * whether this call is even legitimate: a replay that lost the race (status
 * already moved on) or a terminal order throws right there, before stock,
 * the risk score or anything else in this function ever runs — that is the
 * whole idempotency story, not a guard this function adds on top of it.
 */
export async function markDelivered(
	req: PayloadRequest,
	order: Order,
	options: MarkDeliveredOptions,
): Promise<{ order: Order; event: OrderEvent }> {
	const now = new Date();
	const settings = await getOrderSettings(req.payload);
	const withdrawalUntil = new Date(
		now.getTime() + settings.withdrawalDays * 24 * 60 * 60 * 1000,
	).toISOString();

	const handoverSet: NonNullable<Order["handover"]> = {
		...order.handover,
		method: options.method,
	};
	if (
		options.method === "seller_declaration" ||
		options.method === "carrier_pod"
	) {
		handoverSet.contestBy = new Date(
			now.getTime() + CONTEST_WINDOW_MS,
		).toISOString();
	} else {
		handoverSet.verifiedAt = now.toISOString();
		handoverSet.verifiedBy = options.actor ?? null;
	}

	const items = await orderItemsOf(req, order);
	const nextPaymentStatus =
		order.paymentStatus === "cod_pending" ? "cod_collected" : undefined;

	const { order: updated, event } = await applyTransition(
		req,
		order,
		{
			status: "delivered",
			paymentStatus: nextPaymentStatus,
			items: {
				ids: items.map((item) => String(item.id)),
				to: "delivered",
			},
			set: {
				handover: handoverSet,
				deadlines: {
					...order.deadlines,
					completeAt: withdrawalUntil,
					withdrawalUntil,
				},
				timestamps: { ...order.timestamps, deliveredAt: now.toISOString() },
			},
		},
		{
			type: "order.delivered",
			visibility: "both",
			actorType: options.actorType,
			actor: options.actor ?? null,
			actorShopRole: options.actorShopRole ?? null,
			note: options.note ?? null,
			metadata: options.photo ? { photo: options.photo } : null,
		},
	);

	// Everything below only ever runs for the call that actually won the
	// transition above — a retried "mark delivered" throws before reaching
	// here, so there is exactly one sale per item, one score update and one
	// `order.delivered` dispatch (which is where the commission line and the
	// notifications are produced, via the registry, not from this function).
	await moveStockFor(req, updated, items, sell);
	await recordDelivered(req, {
		phone: order.delivery.phone,
		orderId: String(order.id),
	});

	return { order: updated, event };
}

export interface MarkDeliveryFailedOptions {
	reason: DeliveryFailureReason;
	note?: string;
	actorType: OrderActorType;
	actor?: string;
	actorShopRole?: ShopRole;
}

/**
 * The final disposition of a delivery that did not happen: `shipped` →
 * `delivery_failed`. Releases every reserved unit and records a refusal
 * against the delivery phone for the three reasons that are the buyer's
 * fault — `recordRefusal` itself ignores every other reason, so this always
 * calls it with the caller's actual reason rather than pre-filtering, which
 * is what keeps the two in agreement.
 */
export async function markDeliveryFailed(
	req: PayloadRequest,
	order: Order,
	options: MarkDeliveryFailedOptions,
): Promise<{ order: Order; event: OrderEvent }> {
	const items = await orderItemsOf(req, order);
	const buyerFault = BUYER_FAULT_REASONS.has(options.reason);
	const nextPaymentStatus =
		order.paymentStatus === "cod_pending"
			? buyerFault
				? "cod_refused"
				: "unpaid"
			: undefined;

	const { order: updated, event } = await applyTransition(
		req,
		order,
		{
			status: "delivery_failed",
			paymentStatus: nextPaymentStatus,
			items: {
				ids: items.map((item) => String(item.id)),
				to: "failed",
			},
			set: {
				deliveryFailure: {
					...order.deliveryFailure,
					reason: options.reason,
					note: options.note ?? null,
				},
				timestamps: { ...order.timestamps, failedAt: new Date().toISOString() },
			},
		},
		{
			type: "order.delivery_failed",
			visibility: "both",
			actorType: options.actorType,
			actor: options.actor ?? null,
			actorShopRole: options.actorShopRole ?? null,
			reason: options.reason,
			note: options.note ?? null,
		},
	);

	await moveStockFor(req, updated, items, release);
	await recordRefusal(req, {
		phone: order.delivery.phone,
		orderId: String(order.id),
		reason: options.reason,
	});

	return { order: updated, event };
}

export interface ReportFailedAttemptOptions {
	reason: DeliveryFailureReason;
	note?: string;
	actor?: string;
}

/**
 * The first failed attempt only: records it and leaves the order `shipped`,
 * so the seller can try again. A second attempt, or a reason that is never
 * worth retrying (`refused`), has no "attempt" left to report — both go
 * straight to `markDeliveryFailed`, which this function refuses in their
 * place rather than silently recording a second attempt that would never
 * get a final disposition. Always `actorType: "seller"`: the caller is
 * always a shop member (the permission is `orders.process`), and unlike
 * `markDelivered`/`markDeliveryFailed` — whose actor may be the buyer, a
 * courier or staff — nothing here is ever buyer-facing enough to need to
 * say which shop role it was.
 */
export async function reportFailedAttempt(
	req: PayloadRequest,
	order: Order,
	options: ReportFailedAttemptOptions,
): Promise<{ order: Order; event: OrderEvent }> {
	if (order.status !== "shipped") {
		throw new ServiceError(ERROR_CODES.orderInvalidTransition, 409);
	}
	const attempts = order.deliveryFailure?.attempts ?? 0;
	if (options.reason === "refused" || attempts >= 1) {
		throw new ServiceError(
			ERROR_CODES.orderInvalidTransition,
			409,
			"a second failed attempt, or a refusal, must go through mark-delivery-failed",
		);
	}

	const updated = await req.payload.update({
		collection: "orders",
		id: order.id,
		req,
		overrideAccess: true,
		context: ORDER_SERVICE_CONTEXT,
		data: {
			deliveryFailure: {
				...order.deliveryFailure,
				attempts: attempts + 1,
				reason: options.reason,
				note: options.note ?? null,
			},
		},
	});

	const event = await appendOrderEvent(req, updated, {
		type: "order.delivery_attempt_failed",
		visibility: "both",
		actorType: "seller",
		actor: options.actor ?? null,
		reason: options.reason,
		note: options.note ?? null,
	});
	queueOrderEvent(req, updated, event);

	return { order: updated, event };
}

export interface ContestDeliveryOptions {
	note?: string;
	actor: string;
}

/**
 * The buyer's recourse against a seller's declaration (art. 26: the weaker
 * proof carries its own remedy). Only ever applies to a `seller_declaration`
 * handover, and only inside the 48-hour window `markDelivered` opened —
 * both failures answer `order.contestWindowClosed`, because from the
 * buyer's side "there was never a window" and "the window is over" are the
 * same fact: there is nothing left to contest.
 */
export async function contestDelivery(
	req: PayloadRequest,
	order: Order,
	options: ContestDeliveryOptions,
): Promise<{ order: Order; event: OrderEvent }> {
	if (
		order.handover?.method !== "seller_declaration" &&
		order.handover?.method !== "carrier_pod"
	) {
		throw new ServiceError(ERROR_CODES.orderContestWindowClosed, 409);
	}
	const contestBy = order.handover.contestBy
		? Date.parse(order.handover.contestBy)
		: Number.NaN;
	if (!Number.isFinite(contestBy) || Date.now() > contestBy) {
		throw new ServiceError(ERROR_CODES.orderContestWindowClosed, 409);
	}

	const updated = await req.payload.update({
		collection: "orders",
		id: order.id,
		req,
		overrideAccess: true,
		context: ORDER_SERVICE_CONTEXT,
		data: { completionHold: "dispute" },
	});

	const event = await appendOrderEvent(req, updated, {
		type: "order.delivery_contested",
		visibility: "both",
		actorType: "buyer",
		actor: options.actor,
		note: options.note ?? null,
	});
	queueOrderEvent(req, updated, event);

	await req.payload.create({
		collection: "reports",
		req,
		overrideAccess: true,
		data: {
			reporter: options.actor,
			targetType: "order",
			targetId: String(order.id),
			reason: "delivery_contested",
			description: options.note ?? null,
			status: "pending",
		},
	});

	return { order: updated, event };
}

/** 10 handover calls per order per hour, 60 per shop per hour (design doc,
 * "Handover code"). Two separate subjects under one store, so an order
 * hammered from several shops' orders in the same hour still trips the
 * shop-wide window even though each order's own count stays under 10. */
const HANDOVER_RATE_WINDOWS = {
	order: { name: "handover-order", limit: 10, windowSeconds: 3600 },
	shop: { name: "handover-shop", limit: 60, windowSeconds: 3600 },
} as const;

export async function assertHandoverRateLimit(
	store: CounterStore,
	order: Order,
): Promise<void> {
	const shopId = relationId(order.shop) ?? "";
	const orderLimited = await hitRateLimit(store, String(order.id), [
		HANDOVER_RATE_WINDOWS.order,
	]);
	const shopLimited = await hitRateLimit(store, shopId, [
		HANDOVER_RATE_WINDOWS.shop,
	]);
	if (orderLimited || shopLimited) {
		throw new ServiceError(ERROR_CODES.rateLimited, 429);
	}
}
