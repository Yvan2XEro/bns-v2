// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Mirrors `hooks/notificationEvents.ts`'s own (unexported) `TriggerPayload`. */
type TriggerCall = {
	event: string;
	subscriberId: string;
	payload: Record<string, string | number | boolean | null | undefined>;
};

// `vi.hoisted` guarantees these exist before the factory below, which vitest
// hoists above every import. Every export of the real module is replaced:
// several collections import `syncNotificationSubscriber` and
// `buildExpoPushData`, and this file loads `payload.config.ts` — a partial
// mock would break that import, not just the notification.
const { triggerNotificationEvent } = vi.hoisted(() => ({
	triggerNotificationEvent: vi.fn(async (_call: TriggerCall) => {}),
}));

vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent,
	hasPushCredential: vi.fn(async () => false),
	syncNotificationSubscriber: vi.fn(async () => {}),
	buildExpoPushData: vi.fn(() => ({})),
}));

const sendSms = vi.fn();
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));

import { completeOrders } from "../../src/jobs/completeOrders";
import {
	DISPATCH_ATTEMPT_BUDGET,
	runDispatchOrderEvent,
} from "../../src/jobs/dispatchOrderEvent";
import { expireOrders } from "../../src/jobs/expireOrders";
import {
	failStaleOrders,
	STALE_REMINDER_NOTIFICATION,
	STALE_REMINDER_REASON,
} from "../../src/jobs/failStaleOrders";
import { ORDER_BATCH_SIZE } from "../../src/jobs/orderSweep";
import { ERROR_CODES } from "../../src/lib/errors";
import configPromise from "../../src/payload.config";
import { acceptOrder } from "../../src/services/orders/acceptance";
import {
	__resetOrderEventHandlers,
	registerOrderEventHandler,
} from "../../src/services/orders/events";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (offsetMs: number) =>
	new Date(NOW.getTime() + offsetMs).toISOString();

const SHOP = "shop-1";
const OWNER = "owner-1";
const BUYER = "buyer-1";
const ownerUser = { id: OWNER, role: "user" };

const PEPPER = "test-pepper";

function baseOrder(overrides: Doc = {}): Doc {
	return {
		id: "order-1",
		orderNumber: "BNS-2610-000001",
		shop: SHOP,
		buyer: BUYER,
		status: "placed",
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: {
			method: "seller_delivery",
			recipientName: "Aicha",
			phone: "+237600000099",
			city: "douala",
		},
		amounts: { subtotal: 15000, deliveryFee: 0, total: 15000, currency: "XAF" },
		deadlines: {},
		timestamps: {},
		contract: { locale: "fr" },
		confirmation: {},
		handover: {},
		cancellation: {},
		deliveryFailure: {},
		completionHold: "none",
		...overrides,
	};
}

function baseItem(overrides: Doc = {}): Doc {
	return {
		id: "item-1",
		order: "order-1",
		product: "product-1",
		variant: "variant-1",
		fulfillingShop: "shop-1",
		snapshot: { title: "Phone", categoryId: null },
		unitPrice: 15000,
		quantity: 1,
		lineSubtotal: 15000,
		commissionRateBps: 800,
		fulfillmentStatus: "unfulfilled",
		...overrides,
	};
}

function baseVariant(overrides: Doc = {}): Doc {
	return {
		id: "variant-1",
		product: "product-1",
		shop: "shop-1",
		optionValues: {},
		price: 15000,
		trackInventory: true,
		stockOnHand: 5,
		stockReserved: 1,
		...overrides,
	};
}

function world(
	seed: {
		orders?: Doc[];
		items?: Doc[];
		variants?: Doc[];
		events?: Doc[];
	} = {},
): FakePayload {
	return fakePayload(
		{
			users: [
				{ id: OWNER, role: "user" },
				{ id: BUYER, role: "user" },
			],
			shops: [
				{ id: SHOP, status: "active", owner: OWNER, level: 2, stats: {} },
			],
			"shop-members": [
				{
					id: "m-owner",
					shop: SHOP,
					user: OWNER,
					role: "owner",
					status: "active",
				},
			],
			orders: seed.orders ?? [baseOrder()],
			"order-items": seed.items ?? [],
			"product-variants": seed.variants ?? [],
			"order-events": seed.events ?? [],
			"stock-movements": [],
			"buyer-phone-scores": [],
			"commission-lines": [],
		},
		{
			uniques: {
				"buyer-phone-scores": [["phoneHash"]],
				"commission-lines": [["order", "kind"]],
			},
		},
	);
}

const liveOrder = (payload: FakePayload, id = "order-1"): Doc => {
	const order = payload.store.orders.find((row) => String(row.id) === id);
	if (!order) throw new Error(`no order ${id} in the store`);
	return order;
};

const statusOf = (payload: FakePayload, id = "order-1"): unknown =>
	liveOrder(payload, id).status;

const groupOf = (order: Doc, name: string): Doc => (order[name] ?? {}) as Doc;

const eventsOf = (payload: FakePayload, orderId = "order-1"): Doc[] =>
	payload.store["order-events"].filter((row) => String(row.order) === orderId);

const eventTypes = (payload: FakePayload, orderId = "order-1"): unknown[] =>
	eventsOf(payload, orderId).map((row) => row.type);

const shopStats = (payload: FakePayload): Doc =>
	(payload.store.shops[0].stats ?? {}) as Doc;

const releases = (payload: FakePayload): Doc[] =>
	payload.store["stock-movements"].filter((row) => row.type === "release");

const staleReminders = (payload: FakePayload, orderId = "order-1"): Doc[] =>
	eventsOf(payload, orderId).filter(
		(row) => row.reason === STALE_REMINDER_REASON,
	);

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	__resetOrderEventHandlers();
	triggerNotificationEvent.mockClear();
	sendSms.mockReset();
	sendSms.mockResolvedValue({ status: "sent" });
	process.env.ORDER_PHONE_PEPPER = PEPPER;
});

afterEach(() => {
	vi.useRealTimers();
	__resetOrderEventHandlers();
	process.env.ORDER_PHONE_PEPPER = undefined;
});

// Named, because the dispatcher's retry addresses handlers by `fn.name`.
const ran: string[] = [];
async function notifies(): Promise<void> {
	ran.push("notifies");
}
async function indexes(): Promise<void> {
	ran.push("indexes");
}
async function accrues(): Promise<void> {
	ran.push("accrues");
	throw new Error("the commission line could not be written");
}

describe("dispatchOrderEvent", () => {
	const dispatchWorld = () =>
		world({
			events: [
				{
					id: "ev-1",
					order: "order-1",
					type: "order.placed",
					visibility: "both",
				},
			],
		});

	beforeEach(() => {
		ran.length = 0;
	});

	it("runs every handler for the event's type and no handler for another type", async () => {
		const payload = dispatchWorld();
		registerOrderEventHandler("order.placed", notifies);
		registerOrderEventHandler("order.placed", indexes);
		const shipped = vi.fn();
		registerOrderEventHandler("order.shipped", shipped);

		const { output } = await runDispatchOrderEvent(payload, {
			orderId: "order-1",
			eventId: "ev-1",
		});

		expect(ran).toEqual(["notifies", "indexes"]);
		expect(shipped).toHaveBeenCalledTimes(0);
		expect(output).toEqual({ attempt: 1, failed: [], requeued: false });
	});

	it("retries only the handlers that failed", async () => {
		const payload = dispatchWorld();
		registerOrderEventHandler("order.placed", notifies);
		registerOrderEventHandler("order.placed", accrues);

		const first = await runDispatchOrderEvent(payload, {
			orderId: "order-1",
			eventId: "ev-1",
		});

		expect(ran).toEqual(["notifies", "accrues"]);
		expect(first.output).toEqual({
			attempt: 1,
			failed: ["accrues"],
			requeued: true,
		});
		expect(payload.jobs.queue).toHaveBeenCalledTimes(1);
		expect(payload.jobs.queue).toHaveBeenCalledWith(
			expect.objectContaining({
				task: "dispatchOrderEvent",
				queue: "orders",
				input: expect.objectContaining({
					orderId: "order-1",
					eventId: "ev-1",
					attempt: 2,
					handlers: ["accrues"],
				}),
			}),
		);

		// The retry, run exactly as the worker would run the queued job.
		ran.length = 0;
		const second = await runDispatchOrderEvent(payload, {
			orderId: "order-1",
			eventId: "ev-1",
			attempt: 2,
			handlers: ["accrues"],
		});

		expect(ran).toEqual(["accrues"]);
		expect(second.output).toMatchObject({ attempt: 2, failed: ["accrues"] });
	});

	it("gives up after five attempts and logs", async () => {
		const payload = dispatchWorld();
		registerOrderEventHandler("order.placed", accrues);

		const { output } = await runDispatchOrderEvent(payload, {
			orderId: "order-1",
			eventId: "ev-1",
			attempt: DISPATCH_ATTEMPT_BUDGET,
			handlers: ["accrues"],
		});

		expect(ran).toEqual(["accrues"]);
		expect(output).toEqual({
			attempt: 5,
			failed: ["accrues"],
			requeued: false,
		});
		expect(payload.jobs.queue).toHaveBeenCalledTimes(0);
		const logged = payload.logger.error.mock.calls.map((call) =>
			String(call[1] ?? call[0]),
		);
		expect(logged.filter((line) => line.includes("gave up"))).toHaveLength(1);
	});
});

describe("expireOrders", () => {
	it("cancels a placed order past confirmBy with reason confirmation_expired", async () => {
		const payload = world({
			orders: [
				baseOrder({
					status: "placed",
					deadlines: { confirmBy: at(-HOUR), acceptBy: at(DAY) },
				}),
			],
		});

		const result = await expireOrders(payload);

		expect(result).toEqual({
			confirmationExpired: 1,
			sellerTimedOut: 0,
			remindersSent: 0,
			errors: 0,
		});
		const order = liveOrder(payload);
		expect(order.status).toBe("cancelled");
		expect(order.paymentStatus).toBe("unpaid");
		expect(groupOf(order, "cancellation")).toMatchObject({
			by: "system",
			reason: "confirmation_expired",
		});
		expect(eventTypes(payload)).toEqual(["order.cancelled"]);
	});

	it.each([
		"placed",
		"confirmed",
	] as const)("cancels a %s order past acceptBy with seller_timeout and increments stats.ordersAutoCancelled", async (status) => {
		const payload = world({
			orders: [
				baseOrder({
					status,
					deadlines: { confirmBy: at(DAY), acceptBy: at(-HOUR) },
				}),
			],
		});

		const result = await expireOrders(payload);

		expect(result).toMatchObject({
			confirmationExpired: 0,
			sellerTimedOut: 1,
			errors: 0,
		});
		const order = liveOrder(payload);
		expect(order.status).toBe("cancelled");
		expect(order.paymentStatus).toBe("unpaid");
		expect(groupOf(order, "cancellation")).toMatchObject({
			by: "system",
			reason: "seller_timeout",
		});
		expect(eventTypes(payload)).toEqual(["order.declined"]);
		expect(shopStats(payload).ordersAutoCancelled).toBe(1);
	});

	it("sends the accept reminder once at acceptBy − 12 h", async () => {
		const payload = world({
			orders: [
				baseOrder({
					status: "confirmed",
					deadlines: { acceptBy: at(12 * HOUR) },
				}),
				baseOrder({
					id: "order-2",
					orderNumber: "BNS-2610-000002",
					status: "confirmed",
					deadlines: { acceptBy: at(13 * HOUR) },
				}),
			],
		});
		const reminded = vi.fn();
		registerOrderEventHandler("order.accept_reminder_sent", reminded);

		const first = await expireOrders(payload);

		expect(first).toMatchObject({ remindersSent: 1, errors: 0 });
		expect(eventTypes(payload)).toEqual(["order.accept_reminder_sent"]);
		expect(eventTypes(payload, "order-2")).toEqual([]);
		expect(reminded).toHaveBeenCalledTimes(1);

		const second = await expireOrders(payload);

		expect(second).toMatchObject({ remindersSent: 0, errors: 0 });
		expect(eventsOf(payload)).toHaveLength(1);
		expect(reminded).toHaveBeenCalledTimes(1);
	});

	it("leaves a mobile_money order alone in P4", async () => {
		const payload = world({
			orders: [
				baseOrder({
					paymentMethod: "mobile_money",
					paymentStatus: "unpaid",
					status: "placed",
					timestamps: { placedAt: at(-2 * HOUR) },
					deadlines: { confirmBy: at(-HOUR), acceptBy: at(-HOUR) },
				}),
			],
		});

		const result = await expireOrders(payload);

		expect(result).toEqual({
			confirmationExpired: 0,
			sellerTimedOut: 0,
			remindersSent: 0,
			errors: 0,
		});
		const order = liveOrder(payload);
		expect(order.status).toBe("placed");
		expect(order.paymentStatus).toBe("unpaid");
		expect(groupOf(order, "cancellation").reason ?? null).toBeNull();
		expect(eventsOf(payload)).toHaveLength(0);
	});

	it("batches in hundreds and gives each order its own transaction", async () => {
		const total = ORDER_BATCH_SIZE + 1;
		const payload = world({
			orders: Array.from({ length: total }, (_, index) =>
				baseOrder({
					id: `order-${index + 1}`,
					orderNumber: `BNS-2610-${String(index + 1).padStart(6, "0")}`,
					status: "placed",
					deadlines: { confirmBy: at(-HOUR) },
				}),
			),
		});
		let updates = 0;
		payload.failWhen = (method, args) => {
			if (method !== "db.updateOne" || args.collection !== "orders") {
				return false;
			}
			updates += 1;
			return updates === 3;
		};

		const result = await expireOrders(payload);

		expect(result).toMatchObject({
			confirmationExpired: ORDER_BATCH_SIZE - 1,
			errors: 1,
		});
		expect(statusOf(payload, "order-1")).toBe("cancelled");
		expect(statusOf(payload, "order-2")).toBe("cancelled");
		expect(statusOf(payload, "order-3")).toBe("placed");
		expect(statusOf(payload, "order-4")).toBe("cancelled");
		// The hundred-and-first is left for the next run.
		expect(statusOf(payload, `order-${total}`)).toBe("placed");
		expect(eventsOf(payload, "order-3")).toHaveLength(0);

		const transactions = new Set(
			payload.writes
				.filter((write) => write.collection === "orders")
				.map((write) => write.transactionID),
		);
		expect(transactions.size).toBe(ORDER_BATCH_SIZE - 1);
	});

	it("a seller accept racing expireOrders at acceptBy leaves one winner", async () => {
		const payload = world({
			orders: [
				baseOrder({
					status: "confirmed",
					deadlines: { acceptBy: NOW.toISOString() },
				}),
			],
			items: [baseItem()],
			variants: [baseVariant()],
		});

		const [sweep, accept] = await Promise.allSettled([
			expireOrders(payload),
			acceptOrder(payload, ownerUser, "order-1"),
		]);

		const order = liveOrder(payload);
		expect(["accepted", "cancelled"]).toContain(order.status);
		expect(eventsOf(payload)).toHaveLength(1);
		expect(eventTypes(payload)).toEqual([
			order.status === "accepted" ? "order.accepted" : "order.declined",
		]);
		expect(sweep.status).toBe("fulfilled");
		expect(accept.status).toBe(
			order.status === "accepted" ? "fulfilled" : "rejected",
		);
		// The loser lost to the conditional write, not to a clock check: at
		// exactly `acceptBy` the deadline guard in `acceptOrder` still lets the
		// seller through, so `order.acceptDeadlinePassed` here would mean the
		// two never actually raced.
		if (accept.status === "rejected") {
			expect(accept.reason).toMatchObject({
				code: ERROR_CODES.orderInvalidTransition,
			});
		}
	});
});

describe("failStaleOrders", () => {
	const shippedOrder = (overrides: Doc = {}) =>
		baseOrder({
			status: "shipped",
			timestamps: { shippedAt: at(-3 * DAY) },
			deadlines: { staleAt: at(11 * DAY) },
			...overrides,
		});

	it("reminds the shop once at shippedAt + 3 d and fails the order at staleAt with reason timeout", async () => {
		const payload = world({
			orders: [shippedOrder()],
			items: [baseItem({ fulfillmentStatus: "shipped" })],
			variants: [baseVariant()],
		});

		const first = await failStaleOrders(payload);

		expect(first).toEqual({ remindersSent: 1, failed: 0, errors: 0 });
		expect(staleReminders(payload)).toHaveLength(1);
		expect(triggerNotificationEvent).toHaveBeenCalledTimes(1);
		expect(triggerNotificationEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: STALE_REMINDER_NOTIFICATION,
				subscriberId: OWNER,
			}),
		);

		const second = await failStaleOrders(payload);

		expect(second).toEqual({ remindersSent: 0, failed: 0, errors: 0 });
		expect(staleReminders(payload)).toHaveLength(1);
		expect(triggerNotificationEvent).toHaveBeenCalledTimes(1);
		expect(statusOf(payload)).toBe("shipped");

		vi.setSystemTime(new Date(NOW.getTime() + 11 * DAY));
		const third = await failStaleOrders(payload);

		expect(third).toEqual({ remindersSent: 0, failed: 1, errors: 0 });
		const order = liveOrder(payload);
		expect(order.status).toBe("delivery_failed");
		expect(groupOf(order, "deliveryFailure").reason).toBe("timeout");
		expect(eventTypes(payload)).toEqual([
			"order.note_added",
			"order.delivery_failed",
		]);
	});

	it("a timeout failure releases the stock, sets cod_pending → unpaid and records no refusal", async () => {
		const payload = world({
			orders: [shippedOrder({ deadlines: { staleAt: at(-HOUR) } })],
			items: [baseItem({ fulfillmentStatus: "shipped" })],
			variants: [baseVariant({ stockOnHand: 5, stockReserved: 1 })],
		});

		const result = await failStaleOrders(payload);

		expect(result).toMatchObject({ failed: 1, errors: 0 });
		const order = liveOrder(payload);
		expect(order.paymentStatus).toBe("unpaid");
		expect(releases(payload)).toHaveLength(1);
		expect(payload.store["product-variants"][0].stockReserved).toBe(0);
		expect(payload.store["product-variants"][0].stockOnHand).toBe(5);
		expect(payload.store["order-items"][0].fulfillmentStatus).toBe("failed");
		// `timeout` is nobody's fault: the three buyer-fault reasons alone
		// score a phone, so no row exists at all.
		expect(payload.store["buyer-phone-scores"]).toHaveLength(0);
	});
});

describe("completeOrders", () => {
	const deliveredOrder = (overrides: Doc = {}) =>
		baseOrder({
			status: "delivered",
			paymentStatus: "cod_collected",
			deadlines: { completeAt: at(-HOUR) },
			timestamps: { deliveredAt: at(-15 * DAY) },
			...overrides,
		});

	it("completes a delivered order at completeAt", async () => {
		const payload = world({ orders: [deliveredOrder()] });

		const result = await completeOrders(payload);

		expect(result).toEqual({ completed: 1, errors: 0 });
		const order = liveOrder(payload);
		expect(order.status).toBe("completed");
		expect(groupOf(order, "timestamps").completedAt).toBe(NOW.toISOString());
		expect(eventTypes(payload)).toEqual(["order.completed"]);
	});

	it.each([
		"return_case",
		"dispute",
	] as const)("skips one whose completionHold is %s", async (hold) => {
		const payload = world({
			orders: [deliveredOrder({ completionHold: hold })],
		});

		const result = await completeOrders(payload);

		expect(result).toEqual({ completed: 0, errors: 0 });
		expect(statusOf(payload)).toBe("delivered");
		expect(eventsOf(payload)).toHaveLength(0);
	});

	it("writes order.completed once", async () => {
		const payload = world({ orders: [deliveredOrder()] });

		await completeOrders(payload);
		const second = await completeOrders(payload);

		expect(second).toEqual({ completed: 0, errors: 0 });
		expect(eventTypes(payload)).toEqual(["order.completed"]);
	});
});

describe("job registration", () => {
	it("every job is registered in payload.config.ts with its queue", async () => {
		const config = await configPromise;
		const tasks = config.jobs?.tasks ?? [];
		const queuesBySlug = new Map(
			tasks.map((task) => [
				String(task.slug),
				(task.schedule ?? []).map((entry) => entry.queue),
			]),
		);

		// `dispatchOrderEvent` is enqueued rather than scheduled; its queue is
		// the one its retry asks for (pinned in "retries only the handlers
		// that failed") and is drained by the `orders` autoRun entry below.
		expect([...queuesBySlug.keys()]).toEqual(
			expect.arrayContaining([
				"dispatchOrderEvent",
				"expireOrders",
				"failStaleOrders",
				"completeOrders",
			]),
		);
		expect(queuesBySlug.get("expireOrders")).toEqual(["orders"]);
		expect(queuesBySlug.get("failStaleOrders")).toEqual(["hourly"]);
		expect(queuesBySlug.get("completeOrders")).toEqual(["hourly"]);

		const autoRun = Array.isArray(config.jobs?.autoRun)
			? config.jobs.autoRun
			: [];
		expect(autoRun).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					cron: "*/5 * * * *",
					queue: "orders",
					limit: 50,
				}),
				expect.objectContaining({
					cron: "0 * * * *",
					queue: "hourly",
					limit: 20,
				}),
			]),
		);
	});
});
