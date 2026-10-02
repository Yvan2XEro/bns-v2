// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTransaction } from "../../src/lib/transactions";
import type { Order, OrderEvent } from "../../src/payload-types";
import {
	__resetOrderEventHandlers,
	DISPATCH_ATTEMPT_BUDGET,
	DISPATCH_RETRY_BASE_MS,
	queueOrderEvent,
	registerOrderEventHandler,
	runOrderEventHandlers,
	scheduleOrderEventRetry,
} from "../../src/services/orders/events";
import { fakePayload } from "./helpers/fakePayload";

function makeOrder(overrides: Partial<Order> = {}): Order {
	return {
		id: "o-1",
		orderNumber: "ON-1",
		shop: "s-1",
		status: "shipped",
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: { recipientName: "Aïcha", phone: "+237600000000" },
		updatedAt: "2026-09-15T00:00:00.000Z",
		createdAt: "2026-09-15T00:00:00.000Z",
		...overrides,
	};
}

function makeEvent(overrides: Partial<OrderEvent> = {}): OrderEvent {
	return {
		id: "ev-1",
		order: "o-1",
		type: "order.shipped",
		visibility: "both",
		updatedAt: "2026-09-15T00:00:00.000Z",
		createdAt: "2026-09-15T00:00:00.000Z",
		...overrides,
	};
}

afterEach(() => {
	__resetOrderEventHandlers();
});

describe("registerOrderEventHandler / runOrderEventHandlers", () => {
	it("runs only handlers registered for the event's own type", async () => {
		const payload = fakePayload();
		const order = makeOrder();
		const onShipped = vi.fn();
		const onDelivered = vi.fn();
		registerOrderEventHandler("order.shipped", onShipped);
		registerOrderEventHandler("order.delivered", onDelivered);

		await runOrderEventHandlers(
			payload,
			order,
			makeEvent({ type: "order.shipped" }),
		);

		expect(onShipped).toHaveBeenCalledTimes(1);
		expect(onDelivered).not.toHaveBeenCalled();
	});

	it("isolates a failing handler, still runs the rest and reports its name", async () => {
		const payload = fakePayload();
		const order = makeOrder();
		const ranAfterFailure = vi.fn();
		function failing() {
			throw new Error("boom");
		}
		registerOrderEventHandler("order.shipped", failing);
		registerOrderEventHandler("order.shipped", ranAfterFailure);

		const failed = await runOrderEventHandlers(payload, order, makeEvent());

		expect(ranAfterFailure).toHaveBeenCalledTimes(1);
		expect(failed).toEqual(["failing"]);
		expect(payload.logger.error).toHaveBeenCalled();
	});

	it("is a no-op the second time the same event is dispatched", async () => {
		const payload = fakePayload();
		const order = makeOrder();
		const handler = vi.fn();
		registerOrderEventHandler("order.shipped", handler);
		const event = makeEvent();

		await runOrderEventHandlers(payload, order, event);
		await runOrderEventHandlers(payload, order, event);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("does not treat two different events as the same dispatch", async () => {
		const payload = fakePayload();
		const order = makeOrder();
		const handler = vi.fn();
		registerOrderEventHandler("order.shipped", handler);

		await runOrderEventHandlers(payload, order, makeEvent({ id: "ev-1" }));
		await runOrderEventHandlers(payload, order, makeEvent({ id: "ev-2" }));

		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("stops calling a handler once its own unregister function is used", async () => {
		const payload = fakePayload();
		const order = makeOrder();
		const handler = vi.fn();
		const unregister = registerOrderEventHandler("order.shipped", handler);
		unregister();

		await runOrderEventHandlers(payload, order, makeEvent());

		expect(handler).not.toHaveBeenCalled();
	});

	it("__resetOrderEventHandlers clears both the registry and the dispatch log", async () => {
		const payload = fakePayload();
		const order = makeOrder();
		const handler = vi.fn();
		registerOrderEventHandler("order.shipped", handler);
		__resetOrderEventHandlers();

		await runOrderEventHandlers(payload, order, makeEvent());

		expect(handler).not.toHaveBeenCalled();
	});
});

describe("queueOrderEvent", () => {
	it("runs no handler before the commit", async () => {
		const payload = fakePayload();
		const order = makeOrder();
		const event = makeEvent();
		const calls: string[] = [];
		registerOrderEventHandler("order.shipped", () => {
			calls.push("ran");
		});

		let calledDuringTransaction = false;
		await withTransaction(payload, async (req) => {
			queueOrderEvent(req, order, event);
			calledDuringTransaction = calls.length > 0;
		});

		expect(calledDuringTransaction).toBe(false);
		expect(calls).toEqual(["ran"]);
	});

	// `jobs/dispatchOrderEvent.ts` carries the whole retry budget and nothing
	// reached it: the post-commit dispatch ran the handlers inline and threw
	// the failed names away, so a receipt SMS that failed once failed for
	// good. These three pin the hand-off in both directions.
	it("queues the handlers that failed, by name, with the first back-off", async () => {
		const payload = fakePayload();
		const order = makeOrder();
		const event = makeEvent({ id: "ev-9", order: "o-7" });
		const start = Date.now();
		async function sendsReceipt() {
			throw new Error("sms gateway down");
		}
		registerOrderEventHandler("order.shipped", sendsReceipt);
		registerOrderEventHandler("order.shipped", async function notifies() {});

		await withTransaction(payload, async (req) => {
			queueOrderEvent(req, order, event);
		});

		expect(payload.jobs.queue).toHaveBeenCalledTimes(1);
		const [call] = payload.jobs.queue.mock.calls as unknown as [
			[
				{
					task: string;
					queue: string;
					input: Record<string, unknown>;
					waitUntil: Date;
				},
			],
		];
		expect(call[0].task).toBe("dispatchOrderEvent");
		expect(call[0].queue).toBe("orders");
		// Only the handler that threw, and attempt 2 — the inline dispatch was
		// attempt 1. A retry naming `notifies` would notify twice.
		expect(call[0].input).toEqual({
			orderId: "o-7",
			eventId: "ev-9",
			attempt: 2,
			handlers: ["sendsReceipt"],
		});
		expect(call[0].waitUntil.getTime() - start).toBeGreaterThanOrEqual(
			DISPATCH_RETRY_BASE_MS,
		);
	});

	it("queues nothing when every handler succeeds", async () => {
		const payload = fakePayload();
		const order = makeOrder();
		registerOrderEventHandler("order.shipped", async function notifies() {});

		await withTransaction(payload, async (req) => {
			queueOrderEvent(req, order, makeEvent());
		});

		expect(payload.jobs.queue).not.toHaveBeenCalled();
	});

	it("stops at the budget and leaves the failure for a human", async () => {
		const payload = fakePayload();
		const event = makeEvent({ id: "ev-9", order: "o-7" });

		const requeued = await scheduleOrderEventRetry(
			payload,
			event,
			DISPATCH_ATTEMPT_BUDGET,
			["sendsReceipt"],
		);

		expect(requeued).toBe(false);
		expect(payload.jobs.queue).not.toHaveBeenCalled();
		expect(payload.logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				orderId: "o-7",
				eventId: "ev-9",
				attempt: DISPATCH_ATTEMPT_BUDGET,
				failed: ["sendsReceipt"],
			}),
			expect.stringContaining("gave up"),
		);
	});
});
