import type { Payload, PayloadRequest, TaskConfig } from "payload";
import { triggerNotificationEvent } from "../hooks/notificationEvents";
import { relationId } from "../lib/relationId";
import type { Order } from "../payload-types";
import { markDeliveryFailed } from "../services/orders/delivery";
import { recipientsForShop } from "../services/orders/notifications";
import { appendOrderEvent } from "../services/orders/transitions";
import { eachOrder, HOURLY_QUEUE, selectOrders } from "./orderSweep";

/** The spec's nudge: a parcel still in transit three days after shipping. */
const STALE_REMINDER_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The reminder's "sent once" record. P4's event vocabulary is fixed at the
 * spec's 21 types, so the marker is a `note_added` row carrying this
 * `reason` — append-only, visible to the shop and to staff, and read by the
 * same query that decides whether to send the reminder at all.
 */
export const STALE_REMINDER_REASON = "stale_shipment_reminder";

export const STALE_REMINDER_NOTIFICATION = "order-stale-reminder";

export interface FailStaleOrdersResult {
	remindersSent: number;
	failed: number;
	errors: number;
}

async function remindShop(req: PayloadRequest, order: Order): Promise<boolean> {
	const already = await req.payload.count({
		collection: "order-events",
		where: {
			and: [
				{ order: { equals: String(order.id) } },
				{ type: { equals: "order.note_added" } },
				{ reason: { equals: STALE_REMINDER_REASON } },
			],
		},
		overrideAccess: true,
		req,
	});
	if (already.totalDocs > 0) return false;

	await appendOrderEvent(req, order, {
		type: "order.note_added",
		actorType: "system",
		actor: null,
		visibility: "shop",
		source: "job",
		reason: STALE_REMINDER_REASON,
		note: "shipped three days ago and still in transit",
	});
	return true;
}

/**
 * Fired after the marker's transaction commits, like every other order
 * notification: a shop must never be told about a reminder whose own row did
 * not land. Nothing registers a handler for `order.note_added`, so this goes
 * through `triggerNotificationEvent` directly rather than through the event
 * registry.
 */
async function notifyShop(payload: Payload, order: Order): Promise<void> {
	const shopId = relationId(order.shop);
	if (!shopId) return;
	const recipients = await recipientsForShop(payload, shopId, "orders.view");
	for (const subscriberId of recipients) {
		await triggerNotificationEvent({
			event: STALE_REMINDER_NOTIFICATION,
			subscriberId,
			payload: {
				orderId: String(order.id),
				orderNumber: order.orderNumber,
				shippedAt: order.timestamps?.shippedAt ?? "",
				staleAt: order.deadlines?.staleAt ?? "",
			},
		});
	}
}

/**
 * The hourly sweep over shipped orders: a reminder three days in, and the
 * final `delivery_failed` at `staleAt`. The failure itself is Task 20's
 * (`markDeliveryFailed`), which is what releases the reserved stock, moves
 * `cod_pending` to `unpaid` and — `timeout` being nobody's fault — records
 * no refusal against the buyer's phone.
 */
export async function failStaleOrders(
	payload: Payload,
): Promise<FailStaleOrdersResult> {
	const now = new Date();
	const nowIso = now.toISOString();
	const result: FailStaleOrdersResult = {
		remindersSent: 0,
		failed: 0,
		errors: 0,
	};

	const dueForReminder = await selectOrders(payload, {
		and: [
			{ status: { equals: "shipped" } },
			{
				"timestamps.shippedAt": {
					less_than_equal: new Date(
						now.getTime() - STALE_REMINDER_AFTER_MS,
					).toISOString(),
				},
			},
			// An order already past `staleAt` is failed below; "try again" is
			// the wrong thing to send about a delivery that is over.
			{
				or: [
					{ "deadlines.staleAt": { greater_than: nowIso } },
					{ "deadlines.staleAt": { exists: false } },
				],
			},
		],
	});
	const reminded: Order[] = [];
	result.errors += await eachOrder(
		payload,
		dueForReminder,
		"failStaleOrders",
		async (req, order) => {
			if (await remindShop(req, order)) reminded.push(order);
		},
	);
	for (const order of reminded) {
		result.remindersSent += 1;
		await notifyShop(payload, order);
	}

	const stale = await selectOrders(payload, {
		and: [
			{ status: { equals: "shipped" } },
			{ "deadlines.staleAt": { less_than_equal: nowIso } },
		],
	});
	result.errors += await eachOrder(
		payload,
		stale,
		"failStaleOrders",
		async (req, order) => {
			await markDeliveryFailed(req, order, {
				reason: "timeout",
				actorType: "system",
			});
			result.failed += 1;
		},
	);

	return result;
}

export const failStaleOrdersTask: TaskConfig<"failStaleOrders"> = {
	slug: "failStaleOrders",
	retries: 1,
	inputSchema: [],
	outputSchema: [
		{ name: "remindersSent", type: "number" },
		{ name: "failed", type: "number" },
		{ name: "errors", type: "number" },
	],
	schedule: [{ cron: "0 * * * *", queue: HOURLY_QUEUE }],
	handler: async ({ req }) => ({ output: await failStaleOrders(req.payload) }),
};
