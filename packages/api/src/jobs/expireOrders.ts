import type { Payload, PayloadRequest, TaskConfig, Where } from "payload";
import { SHOP_SERVICE_CONTEXT } from "../collections/Shops";
import { getPaymentSettings } from "../lib/paymentSettings";
import { relationId } from "../lib/relationId";
import type { Order } from "../payload-types";
import {
	cancelByConfirmationExpiry,
	cancelByPaymentExpiry,
	declineByTimeout,
} from "../services/orders/acceptance";
import { queueOrderEvent } from "../services/orders/events";
import { appendOrderEvent } from "../services/orders/transitions";
import { eachOrder, ORDER_QUEUE, selectOrders } from "./orderSweep";

/** The spec's reminder lead time: `acceptBy − 12 h`. */
const ACCEPT_REMINDER_LEAD_MS = 12 * 60 * 60 * 1000;

/** Only cash on delivery is confirmed by the buyer; a protected order is confirmed by paying. */
const COD_ONLY: Where = { paymentMethod: { equals: "cod" } };

/**
 * Orders the shop still has to accept: a COD order before acceptance, or a
 * protected order once paid — its `acceptBy` runs from `paidAt`
 * (`checkoutSettlement`). An unpaid protected order is never the shop's to
 * accept, so its own death is the checkout window below, not `acceptBy`.
 */
const AWAITING_ACCEPTANCE: Where = {
	or: [
		{ and: [COD_ONLY, { status: { in: ["placed", "confirmed"] } }] },
		{
			and: [
				{ paymentMethod: { equals: "mobile_money" } },
				{ status: { equals: "paid" } },
			],
		},
	],
};

const ACCEPT_REMINDER_EVENT = "order.accept_reminder_sent";

export interface ExpireOrdersResult {
	paymentExpired: number;
	confirmationExpired: number;
	sellerTimedOut: number;
	remindersSent: number;
	errors: number;
}

/**
 * Mirrors `acceptance.ts`'s own `ordersCancelledBySeller` bump, for the
 * counter a system cancellation feeds instead: a shop whose orders keep
 * timing out shows up in moderation's numbers the same way one that cancels
 * by hand does.
 */
async function bumpAutoCancelled(
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
				ordersAutoCancelled: (shop.stats?.ordersAutoCancelled ?? 0) + 1,
			},
		},
	});
}

/**
 * The shop's "you have twelve hours left" nudge. Written as an order event
 * and dispatched like any other, so the notification itself stays in
 * `orders/notifications.ts` (`notifyOrderAcceptReminder`) instead of being
 * fired from a job. Sent once per order: the event row is the record, and
 * it is read inside the same transaction that writes it.
 */
async function sendAcceptReminder(
	req: PayloadRequest,
	order: Order,
): Promise<boolean> {
	const already = await req.payload.count({
		collection: "order-events",
		where: {
			and: [
				{ order: { equals: String(order.id) } },
				{ type: { equals: ACCEPT_REMINDER_EVENT } },
			],
		},
		overrideAccess: true,
		req,
	});
	if (already.totalDocs > 0) return false;

	const event = await appendOrderEvent(req, order, {
		type: ACCEPT_REMINDER_EVENT,
		actorType: "system",
		actor: null,
		visibility: "shop",
		source: "job",
	});
	queueOrderEvent(req, order, event);
	return true;
}

/**
 * The deadline sweep: the unpaid protected order's checkout window,
 * confirmation expiry, the acceptance timeout, and the reminder that
 * precedes it. `acceptance.ts` owns every death, so a system-driven
 * cancellation writes exactly what a human-driven one writes; this job
 * decides only which orders are due.
 *
 * The passes query in turn rather than in parallel: an order past both
 * `confirmBy` and `acceptBy` is cancelled by the first pass that finds it,
 * and the next pass's own query no longer does.
 */
export async function expireOrders(
	payload: Payload,
): Promise<ExpireOrdersResult> {
	const now = new Date();
	const nowIso = now.toISOString();
	const result: ExpireOrdersResult = {
		paymentExpired: 0,
		confirmationExpired: 0,
		sellerTimedOut: 0,
		remindersSent: 0,
		errors: 0,
	};

	// A success landing after this is refunded as `late_payment` by the
	// settlement, so the window can close without waiting on the provider.
	const { checkoutExpiryMinutes } = await getPaymentSettings(payload);
	const unpaid = await selectOrders(payload, {
		and: [
			{ status: { equals: "placed" } },
			{ paymentMethod: { equals: "mobile_money" } },
			{ paymentStatus: { in: ["unpaid", "awaiting_payment"] } },
			{
				"timestamps.placedAt": {
					less_than_equal: new Date(
						now.getTime() - checkoutExpiryMinutes * 60_000,
					).toISOString(),
				},
			},
		],
	});
	result.errors += await eachOrder(
		payload,
		unpaid,
		"expireOrders",
		async (req, order) => {
			await cancelByPaymentExpiry(req, order);
			result.paymentExpired += 1;
		},
	);

	const confirmationExpired = await selectOrders(payload, {
		and: [
			{ status: { equals: "placed" } },
			COD_ONLY,
			{ "deadlines.confirmBy": { less_than_equal: nowIso } },
		],
	});
	result.errors += await eachOrder(
		payload,
		confirmationExpired,
		"expireOrders",
		async (req, order) => {
			await cancelByConfirmationExpiry(req, order);
			result.confirmationExpired += 1;
		},
	);

	const timedOut = await selectOrders(payload, {
		and: [
			AWAITING_ACCEPTANCE,
			{ "deadlines.acceptBy": { less_than_equal: nowIso } },
		],
	});
	result.errors += await eachOrder(
		payload,
		timedOut,
		"expireOrders",
		async (req, order) => {
			await declineByTimeout(req, order);
			const shopId = relationId(order.shop);
			if (shopId) await bumpAutoCancelled(req, shopId);
			result.sellerTimedOut += 1;
		},
	);

	const dueForReminder = await selectOrders(payload, {
		and: [
			AWAITING_ACCEPTANCE,
			{ "deadlines.acceptBy": { greater_than: nowIso } },
			{
				"deadlines.acceptBy": {
					less_than_equal: new Date(
						now.getTime() + ACCEPT_REMINDER_LEAD_MS,
					).toISOString(),
				},
			},
		],
	});
	result.errors += await eachOrder(
		payload,
		dueForReminder,
		"expireOrders",
		async (req, order) => {
			if (await sendAcceptReminder(req, order)) result.remindersSent += 1;
		},
	);

	return result;
}

export const expireOrdersTask: TaskConfig<"expireOrders"> = {
	slug: "expireOrders",
	retries: 1,
	inputSchema: [],
	outputSchema: [
		{ name: "paymentExpired", type: "number" },
		{ name: "confirmationExpired", type: "number" },
		{ name: "sellerTimedOut", type: "number" },
		{ name: "remindersSent", type: "number" },
		{ name: "errors", type: "number" },
	],
	schedule: [{ cron: "*/5 * * * *", queue: ORDER_QUEUE }],
	handler: async ({ req }) => ({ output: await expireOrders(req.payload) }),
};
