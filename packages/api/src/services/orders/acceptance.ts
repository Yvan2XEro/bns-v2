import type { Payload, PayloadRequest } from "payload";
import {
	requireOrderAudience,
	requireOrderShopPermission,
} from "../../access/orderAccess";
import type { ShopRole } from "../../access/shopRoles";
import { SHOP_SERVICE_CONTEXT } from "../../collections/Shops";
import { ERROR_CODES } from "../../lib/errors";
import { getOrderSettings } from "../../lib/orderSettings";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import { withTransaction } from "../../lib/transactions";
import type { Order, OrderEvent, OrderItem } from "../../payload-types";
import type { ServiceUser } from "../shops";
import { findVariant, release } from "../stock";
import { issueConfirmationCode, verifyConfirmationCode } from "./confirmation";
import { issueHandoverCode } from "./handover";
import { recordCancelAfterAccept } from "./risk";
import { applyTransition } from "./transitions";

/**
 * The accept/decline/ship/cancel/confirm-by-call phase. `applyTransition`
 * (Task 8) is still the only writer of `status`; everything here decides
 * *whether* to call it and what else must happen inside the same
 * transaction. Task 20's `delivery.ts` owns the mark-failed routes past
 * `shipped` — nothing here imports it, and nothing here writes a status
 * only Task 20 is meant to reach.
 */

type CancellationGroup = NonNullable<Order["cancellation"]>;
type CancellationBy = NonNullable<CancellationGroup["by"]>;
type CancellationReason = NonNullable<CancellationGroup["reason"]>;

const SELLER_END_REASONS = [
	"seller_out_of_stock",
	"seller_cannot_deliver",
	"seller_buyer_unreachable",
	"seller_other",
] as const satisfies readonly CancellationReason[];

export const BUYER_CANCEL_REASONS = [
	"buyer_changed_mind",
	"buyer_ordered_by_mistake",
] as const satisfies readonly CancellationReason[];

/** Only these three may die by the buyer's own hand; once a courier has the
 * parcel (`shipped`), a buyer cancels by refusing it at the door, not through
 * this route. The table in `transitions.ts` still lists `shipped →
 * cancelled` as structurally valid — that row belongs to staff/dispute
 * cancellation, not this one, so the restriction lives here rather than in
 * the shared table. */
export const BUYER_CANCELLABLE_STATUSES: readonly Order["status"][] = [
	"placed",
	"confirmed",
	"accepted",
];

export const SELLER_CANCELLABLE_STATUSES: readonly Order["status"][] = [
	"placed",
	"confirmed",
	"accepted",
];

function localeOf(order: Order): "fr" | "en" {
	return order.contract?.locale === "en" ? "en" : "fr";
}

function readyForPickupLabel(locale: "fr" | "en"): string {
	return locale === "fr" ? "Prêt pour le retrait" : "Ready for pickup";
}

function trimmedNote(value: unknown): string | null {
	return typeof value === "string" && value.trim()
		? value.trim().slice(0, 500)
		: null;
}

/**
 * `reason` must be one of the shop's own four reasons, and `seller_other`
 * must carry a note — a blank "other" explains nothing to the buyer or to a
 * moderator reviewing the cancellation later.
 */
function parseSellerEndReason(
	reasonInput: unknown,
	noteInput: unknown,
): { reason: CancellationReason; note: string | null } {
	const reason = SELLER_END_REASONS.find(
		(candidate) => candidate === reasonInput,
	);
	if (!reason) throw new ServiceError(ERROR_CODES.orderReasonRequired, 400);
	const note = trimmedNote(noteInput);
	if (reason === "seller_other" && !note) {
		throw new ServiceError(
			ERROR_CODES.orderReasonRequired,
			400,
			'a note is required when the reason is "seller_other"',
		);
	}
	return { reason, note };
}

/**
 * The record states why, so the buyer must have said why: the spec's cancel
 * input carries `{ reason }`, the enum holds exactly two buyer values, and
 * the `order-cancelled` notification forwards the reason to both parties. A
 * missing reason used to default to "changed their mind" and an unknown one
 * was coerced to it — both wrote a reason the buyer never gave into the
 * cancellation record, with nothing anywhere to show it had happened. Both
 * are now `order.reasonRequired`, which is how a defective client finds out.
 */
function parseBuyerCancelReason(reasonInput: unknown): CancellationReason {
	const reason = BUYER_CANCEL_REASONS.find(
		(candidate) => candidate === reasonInput,
	);
	if (!reason)
		throw new ServiceError(
			ERROR_CODES.orderReasonRequired,
			400,
			"a buyer cancellation reason must be one of the two the order model stores",
		);
	return reason;
}

/**
 * The confirmation-code routes (`confirm`, `confirmation-code/resend`) are
 * the buyer's alone. A shop member — a real audience for the order, just not
 * this one — gets `order.notFound`, the same answer a stranger gets: this is
 * not a permission question `shop.forbidden` would describe, it is "this
 * route does not exist for you".
 */
async function requireBuyer(
	payload: Payload,
	user: ServiceUser,
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

async function loadOrderItemsFor(
	req: PayloadRequest,
	orderId: string,
): Promise<OrderItem[]> {
	const { docs } = await req.payload.find({
		collection: "order-items",
		where: { order: { equals: orderId } },
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
	});
	return docs as OrderItem[];
}

/**
 * Gives every item's reservation back. Never throws — `release` (Task 9) is
 * deliberately silent on a condition it cannot satisfy, because the order is
 * already dying and a stock discrepancy must not block that — and is
 * idempotent per `(order, variant, release)`, so a replay of this same
 * transaction body (a transient-error retry) never double-releases.
 */
async function releaseOrderStock(
	req: PayloadRequest,
	order: Order,
): Promise<void> {
	const items = await loadOrderItemsFor(req, String(order.id));
	for (const item of items) {
		const variantId = relationId(item.variant);
		if (!variantId) continue;
		const variant = await findVariant(req, variantId);
		await release(req, {
			variant,
			quantity: item.quantity,
			orderId: String(order.id),
			orderRef: order.orderNumber,
		});
	}
}

async function bumpShopCancelledBySeller(
	req: PayloadRequest,
	shopId: string,
): Promise<void> {
	const shop = await req.payload.findByID({
		collection: "shops",
		id: shopId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	await req.payload.update({
		collection: "shops",
		id: shopId,
		req,
		overrideAccess: true,
		context: SHOP_SERVICE_CONTEXT,
		data: {
			stats: {
				...shop.stats,
				ordersCancelledBySeller: (shop.stats?.ordersCancelledBySeller ?? 0) + 1,
			},
		},
	});
}

interface EndOrderOptions {
	eventType: "order.declined" | "order.cancelled";
	by: CancellationBy;
	reason: CancellationReason;
	note?: string | null;
	actorType: NonNullable<OrderEvent["actorType"]>;
	actorId?: string | null;
	actorShopRole?: ShopRole | null;
	/** Overrides the COD default below: an unpaid protected order dies `failed`. */
	paymentStatus?: Order["paymentStatus"];
}

/**
 * The one path every way an order dies before shipping funnels through:
 * `applyTransition` writes `status: "cancelled"` (and, for a COD order still
 * awaiting collection, `paymentStatus: "unpaid"`) and its event inside one
 * transaction, and only once that write has actually landed does this
 * release the stock — so a loser of a race (the conditional write throwing
 * first) never reaches `releaseOrderStock` at all, and the ledger's `release`
 * rows exist only for the order that really died.
 */
async function endOrder(
	req: PayloadRequest,
	order: Order,
	opts: EndOrderOptions,
): Promise<{ order: Order; event: OrderEvent }> {
	const now = new Date().toISOString();
	const result = await applyTransition(
		req,
		order,
		{
			status: "cancelled",
			...(opts.paymentStatus
				? { paymentStatus: opts.paymentStatus }
				: order.paymentStatus === "cod_pending"
					? { paymentStatus: "unpaid" as const }
					: {}),
			set: {
				cancellation: {
					by: opts.by,
					reason: opts.reason,
					note: opts.note ?? null,
				},
				timestamps: { ...order.timestamps, cancelledAt: now },
			},
		},
		{
			type: opts.eventType,
			actorType: opts.actorType,
			actor: opts.actorId ?? null,
			actorShopRole: opts.actorShopRole ?? null,
			visibility: "both",
			reason: opts.reason,
			note: opts.note ?? null,
		},
	);
	await releaseOrderStock(req, result.order);
	return result;
}

/**
 * `confirmed`/`paid` → `accepted`; `placed` is refused for not being in the
 * table at all. The deadline is this function's own addition: the table has
 * no notion of time, so an order past `acceptBy` is refused here, before the
 * table is even consulted.
 */
export async function acceptOrder(
	payload: Payload,
	user: ServiceUser,
	orderId: string,
): Promise<{ order: Order; event: OrderEvent }> {
	return withTransaction(
		payload,
		async (req) => {
			const { order, role } = await requireOrderShopPermission(
				payload,
				user,
				orderId,
				"orders.process",
				req,
			);
			const acceptBy = order.deadlines?.acceptBy;
			if (acceptBy && new Date(acceptBy).getTime() < Date.now()) {
				throw new ServiceError(ERROR_CODES.orderAcceptDeadlinePassed, 409);
			}
			return applyTransition(
				req,
				order,
				{
					status: "accepted",
					set: {
						timestamps: {
							...order.timestamps,
							acceptedAt: new Date().toISOString(),
						},
					},
				},
				{
					type: "order.accepted",
					actorType: "seller",
					actor: user.id,
					actorShopRole: role,
					visibility: "both",
				},
			);
		},
		{ user },
	);
}

/** Only from `placed`/`confirmed` — before the shop has committed to the
 * order at all. A shop that wants out *after* accepting uses
 * `sellerCancelOrder` instead, which is owner/manager only and counts
 * against the shop's record. */
export async function declineOrder(
	payload: Payload,
	user: ServiceUser,
	orderId: string,
	input: { reason?: unknown; note?: unknown } = {},
): Promise<{ order: Order; event: OrderEvent }> {
	const { reason, note } = parseSellerEndReason(input.reason, input.note);
	return withTransaction(
		payload,
		async (req) => {
			const { order, role } = await requireOrderShopPermission(
				payload,
				user,
				orderId,
				"orders.process",
				req,
			);
			if (order.status !== "placed" && order.status !== "confirmed") {
				throw new ServiceError(
					ERROR_CODES.orderInvalidTransition,
					409,
					`order ${order.orderNumber} can no longer be declined`,
				);
			}
			return endOrder(req, order, {
				eventType: "order.declined",
				by: "seller",
				reason,
				note,
				actorType: "seller",
				actorId: user.id,
				actorShopRole: role,
			});
		},
		{ user },
	);
}

/**
 * The shop backing out, including after it already accepted — the higher-
 * stakes action, gated on `orders.cancel` (owner/manager, never staff) and
 * counted in `shop.stats.ordersCancelledBySeller` so a shop that does this
 * often shows up in moderation's own numbers.
 */
export async function sellerCancelOrder(
	payload: Payload,
	user: ServiceUser,
	orderId: string,
	input: { reason?: unknown; note?: unknown } = {},
): Promise<{ order: Order; event: OrderEvent }> {
	const { reason, note } = parseSellerEndReason(input.reason, input.note);
	return withTransaction(
		payload,
		async (req) => {
			const { order, role } = await requireOrderShopPermission(
				payload,
				user,
				orderId,
				"orders.cancel",
				req,
			);
			if (!SELLER_CANCELLABLE_STATUSES.includes(order.status)) {
				throw new ServiceError(
					ERROR_CODES.orderInvalidTransition,
					409,
					`order ${order.orderNumber} can no longer be cancelled by the shop`,
				);
			}
			const result = await endOrder(req, order, {
				eventType: "order.cancelled",
				by: "seller",
				reason,
				note,
				actorType: "seller",
				actorId: user.id,
				actorShopRole: role,
			});
			const shopId = relationId(order.shop);
			if (shopId) await bumpShopCancelledBySeller(req, shopId);
			return result;
		},
		{ user },
	);
}

/**
 * The buyer's own cancel, from `placed`, `confirmed` or `accepted` — never
 * `shipped`: once a courier holds the parcel the buyer's only move is to
 * refuse it at the door, which Task 20's delivery routes record, not this
 * one. A cancel that came after the shop had already accepted scores against
 * the buyer's phone (`recordCancelAfterAccept`, Task 10); one that came
 * before acceptance does not — the buyer changing their mind on an order
 * nobody committed to yet is unremarkable.
 */
export async function buyerCancelOrder(
	payload: Payload,
	user: ServiceUser,
	orderId: string,
	input: { reason?: unknown } = {},
): Promise<{ order: Order; event: OrderEvent }> {
	const reason = parseBuyerCancelReason(input.reason);
	return withTransaction(
		payload,
		async (req) => {
			const order = await requireBuyer(payload, user, orderId, req);
			if (!BUYER_CANCELLABLE_STATUSES.includes(order.status)) {
				throw new ServiceError(
					ERROR_CODES.orderInvalidTransition,
					409,
					`order ${order.orderNumber} can no longer be cancelled by the buyer`,
				);
			}
			const wasAccepted = order.status === "accepted";
			const result = await endOrder(req, order, {
				eventType: "order.cancelled",
				by: "buyer",
				reason,
				actorType: "buyer",
				actorId: user.id,
			});
			if (wasAccepted) {
				await recordCancelAfterAccept(req, {
					phone: order.delivery.phone,
					orderId: String(order.id),
				});
			}
			return result;
		},
		{ user },
	);
}

/**
 * `accepted` → `shipped`. Every item moves to `shipped` fulfilment, the
 * handover code is issued inside this same transaction (Task 13's
 * `issueHandoverCode` writes through the `req` it is given rather than
 * opening its own), and `deadlines.staleAt` is set from the settings global —
 * so a ship that loses a concurrent cancel never reaches any of this: the
 * conditional write throws first, and the handover SMS that `issueHandoverCode`
 * queues for after commit is never queued at all.
 */
export async function shipOrder(
	payload: Payload,
	user: ServiceUser,
	orderId: string,
): Promise<{ order: Order; event: OrderEvent }> {
	return withTransaction(
		payload,
		async (req) => {
			const { order, role } = await requireOrderShopPermission(
				payload,
				user,
				orderId,
				"orders.process",
				req,
			);
			const items = await loadOrderItemsFor(req, orderId);
			const settings = await getOrderSettings(payload);
			const now = new Date();
			const staleAt = new Date(
				now.getTime() + settings.staleShippedDays * 86_400_000,
			).toISOString();

			const transition = await applyTransition(
				req,
				order,
				{
					status: "shipped",
					items: { ids: items.map((item) => String(item.id)), to: "shipped" },
					set: {
						deadlines: { ...order.deadlines, staleAt },
						timestamps: { ...order.timestamps, shippedAt: now.toISOString() },
						...(order.delivery.method === "pickup"
							? {
									delivery: {
										...order.delivery,
										etaText: readyForPickupLabel(localeOf(order)),
									},
								}
							: {}),
					},
				},
				{
					type: "order.shipped",
					actorType: "seller",
					actor: user.id,
					actorShopRole: role,
					visibility: "both",
				},
			);

			await issueHandoverCode(req, transition.order, { regenerate: false });
			return transition;
		},
		{ user },
	);
}

/**
 * The buyer's own code, verified by `verifyConfirmationCode` (Task 13) —
 * `placed` → `confirmed` only; the shop still has its own `acceptOrder` to
 * call within the 48-hour window. A wrong code is `verifyConfirmationCode`'s
 * own throw; it already wrote its attempt before this call ever reaches the
 * transition.
 */
export async function confirmByBuyerCode(
	payload: Payload,
	user: ServiceUser,
	orderId: string,
	code: unknown,
): Promise<{ order: Order; event: OrderEvent }> {
	if (typeof code !== "string" || !code.trim()) {
		throw new ServiceError(ERROR_CODES.orderConfirmationCodeInvalid, 400);
	}
	return withTransaction(
		payload,
		async (req) => {
			const order = await requireBuyer(payload, user, orderId, req);
			await verifyConfirmationCode(req, order, code.trim());
			const now = new Date().toISOString();
			return applyTransition(
				req,
				order,
				{
					status: "confirmed",
					set: {
						confirmation: {
							...order.confirmation,
							confirmedAt: now,
							confirmedBy: user.id,
						},
						timestamps: { ...order.timestamps, confirmedAt: now },
					},
				},
				{
					type: "order.confirmed",
					actorType: "buyer",
					actor: user.id,
					visibility: "both",
				},
			);
		},
		{ user },
	);
}

/**
 * The seller-call path: a seller who reached the buyer by phone confirms
 * *and* accepts in the same breath, so this moves `placed` → `confirmed` →
 * `accepted` in one transaction, writing both events. The ruling this
 * implements: the spec never says this route checks `confirmBy`, but it has
 * to — a seller calling after the window has closed would otherwise confirm
 * an order Task 26's job is about to cancel out from under them.
 */
export async function confirmBySellerCall(
	payload: Payload,
	user: ServiceUser,
	orderId: string,
): Promise<{ order: Order; events: [OrderEvent, OrderEvent] }> {
	return withTransaction(
		payload,
		async (req) => {
			const { order, role } = await requireOrderShopPermission(
				payload,
				user,
				orderId,
				"orders.process",
				req,
			);
			const confirmBy = order.deadlines?.confirmBy;
			if (confirmBy && new Date(confirmBy).getTime() < Date.now()) {
				throw new ServiceError(ERROR_CODES.orderConfirmationCodeExpired, 400);
			}

			const now = new Date().toISOString();
			const confirmed = await applyTransition(
				req,
				order,
				{
					status: "confirmed",
					set: {
						confirmation: {
							...order.confirmation,
							method: "seller_call",
							confirmedAt: now,
							confirmedBy: user.id,
						},
						timestamps: { ...order.timestamps, confirmedAt: now },
					},
				},
				{
					type: "order.confirmed",
					actorType: "seller",
					actor: user.id,
					actorShopRole: role,
					visibility: "both",
				},
			);
			const accepted = await applyTransition(
				req,
				confirmed.order,
				{
					status: "accepted",
					set: {
						timestamps: { ...confirmed.order.timestamps, acceptedAt: now },
					},
				},
				{
					type: "order.accepted",
					actorType: "seller",
					actor: user.id,
					actorShopRole: role,
					visibility: "both",
				},
			);
			return {
				order: accepted.order,
				events: [confirmed.event, accepted.event],
			};
		},
		{ user },
	);
}

/** The buyer's own resend, reusing Task 13's cooldown and limit
 * (`issueConfirmationCode`). Never returns the plaintext code — unlike the
 * handover code, the confirmation code is meant to travel by SMS only. */
export async function resendConfirmationCode(
	payload: Payload,
	user: ServiceUser,
	orderId: string,
): Promise<{ expiresAt: string }> {
	return withTransaction(
		payload,
		async (req) => {
			const order = await requireBuyer(payload, user, orderId, req);
			// `issueConfirmationCode` itself checks `canResend` and throws
			// `order.codeResendLimit` — no need to duplicate that check here.
			const { expiresAt } = await issueConfirmationCode(req, order, {
				resend: true,
			});
			return { expiresAt };
		},
		{ user },
	);
}

/**
 * Task 26's `expireOrders` calls these two directly, inside whatever
 * transaction it already opened per order — neither opens one of its own,
 * unlike every function above. The job holds no transition logic of its
 * own: both funnel through the same `endOrder` every manual cancellation
 * uses, so a system-driven death and a human-driven one write the same
 * shape of event.
 */
export async function cancelByConfirmationExpiry(
	req: PayloadRequest,
	order: Order,
): Promise<{ order: Order; event: OrderEvent }> {
	return endOrder(req, order, {
		eventType: "order.cancelled",
		by: "system",
		reason: "confirmation_expired",
		actorType: "system",
	});
}

export async function declineByTimeout(
	req: PayloadRequest,
	order: Order,
): Promise<{ order: Order; event: OrderEvent }> {
	return endOrder(req, order, {
		eventType: "order.declined",
		by: "system",
		reason: "seller_timeout",
		actorType: "system",
	});
}

/**
 * A `mobile_money` order whose payment never arrived: the checkout window
 * closed (`expireOrders`) or the last attempt failed or expired
 * (`checkoutSettlement`). `paymentStatus` goes to `failed` with the status, in
 * the caller's transaction, and the stock is released like any other death.
 */
export async function cancelByPaymentExpiry(
	req: PayloadRequest,
	order: Order,
): Promise<{ order: Order; event: OrderEvent }> {
	return endOrder(req, order, {
		eventType: "order.cancelled",
		by: "system",
		reason: "payment_expired",
		actorType: "system",
		paymentStatus: "failed",
	});
}
