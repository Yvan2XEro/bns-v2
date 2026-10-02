import type { Payload, PayloadRequest } from "payload";
import { isSuspended } from "../../access/roles";
import {
	can,
	resolveShopRole,
	type ShopPermission,
} from "../../access/shopRoles";
import {
	hasPushCredential,
	triggerNotificationEvent,
} from "../../hooks/notificationEvents";
import { relationId } from "../../lib/relationId";
import type { CommissionInvoice, Order, Shop } from "../../payload-types";
import type { OrderEventHandler } from "./events";
import { registerOrderEventHandler } from "./events";
import { sellerNewOrderSms, sendOrderSms } from "./sms";

type NotificationPayloadValue = string | number | boolean | null | undefined;
type OrderNotificationPayload = Record<string, NotificationPayloadValue>;

/** Mirrors `hooks/notificationEvents.ts`'s own trigger call, one event at a time. */
async function fire(
	event: string,
	subscriberId: string,
	payload: OrderNotificationPayload,
): Promise<void> {
	await triggerNotificationEvent({ event, subscriberId, payload });
}

/**
 * Active shop members holding `permission`, excluding suspended accounts —
 * the order-domain counterpart to `shopMemberNotifications.ts`'s inbox
 * resolution, generalised to any `ShopPermission` because order and
 * commission notifications gate on different ones (`orders.view` for most of
 * them, `payments.view` for the commission trio).
 */
export async function recipientsForShop(
	payload: Payload,
	shopId: string,
	permission: ShopPermission,
	req?: PayloadRequest,
): Promise<string[]> {
	const rows = await payload.find({
		collection: "shop-members",
		where: {
			and: [{ shop: { equals: shopId } }, { status: { equals: "active" } }],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
	});

	const context: Record<string, unknown> = {};
	const recipients: string[] = [];
	for (const row of rows.docs) {
		const userId = relationId(row.user);
		if (!userId) continue;
		const role = await resolveShopRole(payload, userId, shopId, context);
		if (!can(role, permission)) continue;
		const user = await payload
			.findByID({
				collection: "users",
				id: userId,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		if (!user || isSuspended(user)) continue;
		recipients.push(userId);
	}
	return recipients;
}

/** `order.shop` comes back populated when the caller fetched it that way, and
 * as a bare id otherwise (the common case: handlers receive whatever
 * `applyTransition`'s conditional update returned, which is depth 0). */
async function shopOf(
	payload: Payload,
	order: Order,
	req?: PayloadRequest,
): Promise<Shop | null> {
	if (typeof order.shop === "object") return order.shop;
	const shopId = relationId(order.shop);
	if (!shopId) return null;
	return payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
}

function resolveConfirmationRequired(
	order: Order,
): "none" | "sms_code" | "seller_call" {
	const method = order.confirmation?.method;
	if (method === "sms_code" || method === "seller_call") return method;
	return "none";
}

/** JSON-ish fields (`pickupPoint`) have to collapse to a primitive: the
 * payload type this whole module writes through never carries a nested
 * object, the same discipline `assertNoSecretsInMetadata` enforces one layer
 * down in `transitions.ts`. */
function serializeJsonField(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	return JSON.stringify(value);
}

async function anyRecipientHasPushCredential(
	subscriberIds: readonly string[],
): Promise<boolean> {
	for (const subscriberId of subscriberIds) {
		if (await hasPushCredential(subscriberId)) return true;
	}
	return false;
}

/** Fallback to the shop's own contact phone, then its owner's account phone. */
async function sellerSmsTarget(
	payload: Payload,
	shop: Shop | null,
	req?: PayloadRequest,
): Promise<string | null> {
	if (!shop) return null;
	if (shop.contact?.phone) return shop.contact.phone;
	const ownerId = relationId(shop.owner);
	if (!ownerId) return null;
	const owner = await payload
		.findByID({
			collection: "users",
			id: ownerId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	return owner?.phone ?? null;
}

/**
 * The spec's fourth SMS: sent to the shop only when none of the recipients
 * just notified has a working push credential, so a seller with no
 * notifications set up still learns about the order within its 48-hour
 * accept window. Never carries a code — `sellerNewOrderSms` sends the seller
 * to the app to accept or decline, exactly like every other seller action.
 */
async function maybeNotifySellerBySms(
	payload: Payload,
	order: Order,
	shop: Shop | null,
	recipients: readonly string[],
): Promise<void> {
	if (recipients.length === 0) return;
	if (await anyRecipientHasPushCredential(recipients)) return;

	const to = await sellerSmsTarget(payload, shop);
	if (!to) return;

	const locale = order.contract?.locale ?? "fr";
	const text = sellerNewOrderSms(
		{ orderNumber: order.orderNumber, total: order.amounts?.total ?? 0 },
		locale,
	);
	await sendOrderSms(payload, { to, text });
}

export const notifyOrderPlaced: OrderEventHandler = async (payload, order) => {
	const shop = await shopOf(payload, order);
	const shopId = relationId(order.shop);
	const buyerId = relationId(order.buyer);
	const base: OrderNotificationPayload = {
		orderId: order.id,
		orderNumber: order.orderNumber,
		shopName: shop?.name ?? "",
		total: order.amounts?.total ?? 0,
		confirmationRequired: resolveConfirmationRequired(order),
	};

	if (buyerId)
		await fire("order-placed", buyerId, { ...base, audience: "buyer" });
	if (!shopId) return;

	const recipients = await recipientsForShop(payload, shopId, "orders.view");
	for (const subscriberId of recipients) {
		await fire("order-placed", subscriberId, { ...base, audience: "shop" });
	}
	await maybeNotifySellerBySms(payload, order, shop, recipients);
};

export const notifyOrderConfirmationNeeded: OrderEventHandler = async (
	payload,
	order,
) => {
	if (order.confirmation?.method !== "seller_call") return;
	const shopId = relationId(order.shop);
	if (!shopId) return;

	const recipients = await recipientsForShop(payload, shopId, "orders.view");
	for (const subscriberId of recipients) {
		await fire("order-confirmation-needed", subscriberId, {
			orderId: order.id,
			orderNumber: order.orderNumber,
			tier: order.risk?.phoneTier ?? "new",
		});
	}
};

export const notifyOrderAcceptReminder: OrderEventHandler = async (
	payload,
	order,
) => {
	const shopId = relationId(order.shop);
	if (!shopId) return;

	const recipients = await recipientsForShop(payload, shopId, "orders.view");
	for (const subscriberId of recipients) {
		await fire("order-accept-reminder", subscriberId, {
			orderId: order.id,
			orderNumber: order.orderNumber,
			acceptBy: order.deadlines?.acceptBy ?? order.createdAt,
		});
	}
};

export const notifyOrderAccepted: OrderEventHandler = async (
	payload,
	order,
) => {
	const buyerId = relationId(order.buyer);
	if (!buyerId) return;
	const shop = await shopOf(payload, order);
	await fire("order-accepted", buyerId, {
		orderId: order.id,
		orderNumber: order.orderNumber,
		shopName: shop?.name ?? "",
		etaText: order.delivery?.etaText ?? "",
	});
};

export const notifyOrderShipped: OrderEventHandler = async (
	_payload,
	order,
) => {
	const buyerId = relationId(order.buyer);
	if (!buyerId) return;
	await fire("order-shipped", buyerId, {
		orderId: order.id,
		orderNumber: order.orderNumber,
		method: order.delivery?.method ?? "",
		pickupPoint: serializeJsonField(order.delivery?.pickupPoint),
	});
};

export const notifyOrderDelivered: OrderEventHandler = async (
	payload,
	order,
) => {
	const shopId = relationId(order.shop);
	const buyerId = relationId(order.buyer);
	const base: OrderNotificationPayload = {
		orderId: order.id,
		orderNumber: order.orderNumber,
		withdrawalUntil: order.deadlines?.withdrawalUntil ?? "",
		reviewUrl: `/purchases/${order.id}`,
	};

	if (buyerId) await fire("order-delivered", buyerId, base);
	if (!shopId) return;

	const recipients = await recipientsForShop(payload, shopId, "orders.view");
	for (const subscriberId of recipients) {
		await fire("order-delivered", subscriberId, base);
	}
};

/** Fires alongside `notifyOrderDelivered` on the very same event, but only
 * when the proof is the weaker one (art. 26): the buyer needs to know they
 * can still contest it, which a buyer confirmed by OTP never needs to hear. */
export const notifyOrderDeliveryDeclared: OrderEventHandler = async (
	_payload,
	order,
) => {
	if (order.handover?.method !== "seller_declaration") return;
	const buyerId = relationId(order.buyer);
	if (!buyerId) return;
	await fire("order-delivery-declared", buyerId, {
		orderId: order.id,
		orderNumber: order.orderNumber,
		contestBy: order.handover?.contestBy ?? "",
	});
};

/** Registered for both `order.cancelled` and `order.declined`: the spec's
 * `order-cancelled` workflow covers every route to a cancelled order, and the
 * event type only tells us who initiated it, not that the notification
 * differs. */
export const notifyOrderCancelled: OrderEventHandler = async (
	payload,
	order,
) => {
	const shopId = relationId(order.shop);
	const buyerId = relationId(order.buyer);
	const base: OrderNotificationPayload = {
		orderId: order.id,
		orderNumber: order.orderNumber,
		by: order.cancellation?.by ?? "",
		reason: order.cancellation?.reason ?? "",
	};

	if (buyerId) await fire("order-cancelled", buyerId, base);
	if (!shopId) return;

	const recipients = await recipientsForShop(payload, shopId, "orders.view");
	for (const subscriberId of recipients) {
		await fire("order-cancelled", subscriberId, base);
	}
};

export const notifyOrderDeliveryFailed: OrderEventHandler = async (
	payload,
	order,
) => {
	const shopId = relationId(order.shop);
	const buyerId = relationId(order.buyer);
	const base: OrderNotificationPayload = {
		orderId: order.id,
		orderNumber: order.orderNumber,
		reason: order.deliveryFailure?.reason ?? "",
	};

	if (buyerId) await fire("order-delivery-failed", buyerId, base);
	if (!shopId) return;

	const recipients = await recipientsForShop(payload, shopId, "orders.view");
	for (const subscriberId of recipients) {
		await fire("order-delivery-failed", subscriberId, base);
	}
};

async function returnCaseNumber(
	payload: Payload,
	order: Order,
	req?: PayloadRequest,
): Promise<string> {
	const caseId = relationId(order.returnCase);
	if (!caseId) return "";
	const found = await payload
		.findByID({
			collection: "return-cases",
			id: caseId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	return found?.number ?? "";
}

/** Reaches the buyer and the shop's owner/manager — never staff, the same
 * split as a shop's payment-facing permissions (`orders.cancel`). */
export const notifyOrderWithdrawalRequested: OrderEventHandler = async (
	payload,
	order,
	event,
) => {
	const shopId = relationId(order.shop);
	const buyerId = relationId(order.buyer);
	const base: OrderNotificationPayload = {
		orderId: order.id,
		caseNumber: await returnCaseNumber(payload, order),
		itemsCount: event.items?.length ?? 0,
	};

	if (buyerId) await fire("order-withdrawal-requested", buyerId, base);
	if (!shopId) return;

	const recipients = await recipientsForShop(payload, shopId, "orders.cancel");
	for (const subscriberId of recipients) {
		await fire("order-withdrawal-requested", subscriberId, base);
	}
};

/**
 * Not an order-event handler: nothing fires this from a status transition.
 * A future job sends it once, three days after delivery, when no review
 * exists yet for the order's buyer and shop.
 */
export async function notifyOrderReviewReminder(
	payload: Payload,
	order: Order,
): Promise<void> {
	const buyerId = relationId(order.buyer);
	if (!buyerId) return;
	const shop = await shopOf(payload, order);
	await fire("order-review-reminder", buyerId, {
		orderId: order.id,
		shopName: shop?.name ?? "",
	});
}

/** The three commission-invoice workflows reach owner/manager only: staff
 * never sees the shop's money (`payments.view`, the same gate as the
 * `commission`/`amounts` fields on the order itself). Plain exported
 * functions, not order-event handlers — a commission invoice is its own
 * collection, not an order, and the jobs/routes that move it (P4's own
 * `issueCommissionInvoices`, `enforceCommissionOverdue` and the `commission`
 * settlement handler) call these directly. */
export async function notifyCommissionInvoiceIssued(
	payload: Payload,
	invoice: CommissionInvoice,
): Promise<void> {
	const shopId = relationId(invoice.shop);
	if (!shopId) return;
	const recipients = await recipientsForShop(payload, shopId, "payments.view");
	for (const subscriberId of recipients) {
		await fire("commission-invoice-issued", subscriberId, {
			invoiceId: invoice.id,
			invoiceNumber: invoice.invoiceNumber,
			totalDue: invoice.totalDue ?? 0,
			dueAt: invoice.dueAt ?? "",
		});
	}
}

export async function notifyCommissionInvoiceOverdue(
	payload: Payload,
	invoice: CommissionInvoice,
	stage: "due_soon" | "overdue" | "restricted",
): Promise<void> {
	const shopId = relationId(invoice.shop);
	if (!shopId) return;
	const recipients = await recipientsForShop(payload, shopId, "payments.view");
	for (const subscriberId of recipients) {
		await fire("commission-invoice-overdue", subscriberId, {
			invoiceId: invoice.id,
			invoiceNumber: invoice.invoiceNumber,
			stage,
		});
	}
}

export async function notifyCommissionInvoicePaid(
	payload: Payload,
	invoice: CommissionInvoice,
): Promise<void> {
	const shopId = relationId(invoice.shop);
	if (!shopId) return;
	const recipients = await recipientsForShop(payload, shopId, "payments.view");
	for (const subscriberId of recipients) {
		await fire("commission-invoice-paid", subscriberId, {
			invoiceId: invoice.id,
			invoiceNumber: invoice.invoiceNumber,
		});
	}
}

/**
 * Registers every order-event-driven notification. Called once below, at
 * module load — `registerOrderEventHandler` is keyed by function identity,
 * and ES modules cache a single instance of this file, so a second import
 * can never register the same handler twice in production. The dispatcher
 * (`runOrderEventHandlers`) is itself idempotent per `event.id`, which is
 * what actually protects a retried dispatch from notifying twice.
 *
 * Exported so a test that calls `__resetOrderEventHandlers()` — the only way
 * to give itself a clean dispatch log between cases — can restore the
 * registrations that reset also wipes, without hand-duplicating this list.
 */
export function registerOrderNotificationHandlers(): void {
	registerOrderEventHandler("order.placed", notifyOrderPlaced);
	registerOrderEventHandler("order.placed", notifyOrderConfirmationNeeded);
	registerOrderEventHandler(
		"order.accept_reminder_sent",
		notifyOrderAcceptReminder,
	);
	registerOrderEventHandler("order.accepted", notifyOrderAccepted);
	registerOrderEventHandler("order.shipped", notifyOrderShipped);
	registerOrderEventHandler("order.delivered", notifyOrderDelivered);
	registerOrderEventHandler("order.delivered", notifyOrderDeliveryDeclared);
	registerOrderEventHandler("order.cancelled", notifyOrderCancelled);
	registerOrderEventHandler("order.declined", notifyOrderCancelled);
	registerOrderEventHandler("order.delivery_failed", notifyOrderDeliveryFailed);
	registerOrderEventHandler(
		"order.withdrawal_requested",
		notifyOrderWithdrawalRequested,
	);
}

registerOrderNotificationHandlers();
