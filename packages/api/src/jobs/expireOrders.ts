import type { Payload, PayloadRequest, TaskConfig, Where } from "payload";
import { SHOP_SERVICE_CONTEXT } from "../collections/Shops";
import { relationId } from "../lib/relationId";
import type { Order } from "../payload-types";
import {
	cancelByConfirmationExpiry,
	declineByTimeout,
} from "../services/orders/acceptance";
import { queueOrderEvent } from "../services/orders/events";
import { appendOrderEvent } from "../services/orders/transitions";
import { eachOrder, ORDER_QUEUE, selectOrders } from "./orderSweep";

/** The spec's reminder lead time: `acceptBy − 12 h`. */
const ACCEPT_REMINDER_LEAD_MS = 12 * 60 * 60 * 1000;

/**
 * P4 expires cash-on-delivery orders only. A `mobile_money` order still
 * unpaid past the checkout window dies with `payment_expired`, and a `paid`
 * order past `acceptBy` dies with `seller_timeout` — both rows belong to P5,
 * which owns the `paid` status this phase may not even write.
 */
const COD_ONLY: Where = { paymentMethod: { equals: "cod" } };

const ACCEPT_REMINDER_EVENT = "order.accept_reminder_sent";

export interface ExpireOrdersResult {
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
 * The deadline sweep: confirmation expiry, the acceptance timeout, and the
 * reminder that precedes it. `acceptance.ts` owns both deaths, so a
 * system-driven cancellation writes exactly what a human-driven one writes;
 * this job decides only which orders are due.
 *
 * The three passes query in turn rather than in parallel: an order past both
 * `confirmBy` and `acceptBy` is cancelled by the first pass, and the second
 * pass's own query no longer finds it.
 */
export async function expireOrders(
	payload: Payload,
): Promise<ExpireOrdersResult> {
	const now = new Date();
	const nowIso = now.toISOString();
	const result: ExpireOrdersResult = {
		confirmationExpired: 0,
		sellerTimedOut: 0,
		remindersSent: 0,
		errors: 0,
	};

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
			{ status: { in: ["placed", "confirmed"] } },
			COD_ONLY,
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
			{ status: { in: ["placed", "confirmed"] } },
			COD_ONLY,
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
		{ name: "confirmationExpired", type: "number" },
		{ name: "sellerTimedOut", type: "number" },
		{ name: "remindersSent", type: "number" },
		{ name: "errors", type: "number" },
	],
	schedule: [{ cron: "*/5 * * * *", queue: ORDER_QUEUE }],
	handler: async ({ req }) => ({ output: await expireOrders(req.payload) }),
};
