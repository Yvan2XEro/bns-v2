import type { Payload, TaskConfig } from "payload";
import { runOrderEventHandlers } from "../services/orders/events";
import { ORDER_QUEUE } from "./orderSweep";

/** The spec's retry budget: the first dispatch plus four retries. */
export const DISPATCH_ATTEMPT_BUDGET = 5;

/** First back-off, doubled per attempt — 30 s, 1 min, 2 min, 4 min. */
const RETRY_BASE_MS = 30_000;

export interface DispatchOrderEventInput {
	orderId: string;
	eventId: string;
	/** 1 for the first dispatch; a retry carries its own number. */
	attempt?: number;
	/**
	 * A retry's targets: the handlers the previous attempt reported as
	 * failed. Empty or absent means "every handler registered for the event's
	 * type", which is what the first dispatch wants.
	 */
	handlers?: string[];
}

export interface DispatchOrderEventResult {
	attempt: number;
	failed: string[];
	requeued: boolean;
}

function namesOf(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const names = value.filter(
		(item): item is string => typeof item === "string",
	);
	return names.length > 0 ? names : undefined;
}

/**
 * Runs one order event's handlers and decides what happens to the ones that
 * failed. Kept apart from `TaskConfig.handler` (same reasoning as
 * `runProcessKycEvent`) so it can be pinned against a plain `payload`.
 *
 * A failure re-queues *this* task with the failed handlers' names rather
 * than letting Payload retry the job: Payload's own retry re-runs the task
 * with the input it already had, which cannot narrow the work to the
 * handlers that still need doing — and re-running a handler that already
 * sold stock or wrote a commission line is the one thing the registry's
 * idempotency exists to prevent.
 */
export async function runDispatchOrderEvent(
	payload: Payload,
	input: DispatchOrderEventInput,
): Promise<{ output: DispatchOrderEventResult }> {
	const attempt = input.attempt ?? 1;
	const only = namesOf(input.handlers);

	const order = await payload.findByID({
		collection: "orders",
		id: input.orderId,
		depth: 0,
		overrideAccess: true,
	});
	const event = await payload.findByID({
		collection: "order-events",
		id: input.eventId,
		depth: 0,
		overrideAccess: true,
	});

	const failed = await runOrderEventHandlers(payload, order, event, { only });
	if (failed.length === 0) {
		return { output: { attempt, failed, requeued: false } };
	}

	if (attempt >= DISPATCH_ATTEMPT_BUDGET) {
		payload.logger.error(
			{
				orderId: input.orderId,
				eventId: input.eventId,
				type: event.type,
				attempt,
				failed,
			},
			"[orders] event dispatch gave up after the retry budget",
		);
		return { output: { attempt, failed, requeued: false } };
	}

	await payload.jobs.queue({
		task: "dispatchOrderEvent",
		queue: ORDER_QUEUE,
		input: {
			orderId: input.orderId,
			eventId: input.eventId,
			attempt: attempt + 1,
			handlers: failed,
		},
		waitUntil: new Date(Date.now() + RETRY_BASE_MS * 2 ** (attempt - 1)),
	});

	return { output: { attempt, failed, requeued: true } };
}

export const dispatchOrderEventTask: TaskConfig<"dispatchOrderEvent"> = {
	slug: "dispatchOrderEvent",
	// The retry budget lives in the input, not here: see
	// `runDispatchOrderEvent`. Payload's own retry would re-run every
	// handler, including the ones that already succeeded.
	retries: 0,
	inputSchema: [
		{ name: "orderId", type: "text", required: true },
		{ name: "eventId", type: "text", required: true },
		{ name: "attempt", type: "number" },
		{ name: "handlers", type: "json" },
	],
	outputSchema: [
		{ name: "attempt", type: "number" },
		{ name: "failed", type: "json" },
		{ name: "requeued", type: "checkbox" },
	],
	handler: async ({ input, req }) =>
		runDispatchOrderEvent(req.payload, {
			orderId: input.orderId,
			eventId: input.eventId,
			attempt: typeof input.attempt === "number" ? input.attempt : 1,
			handlers: namesOf(input.handlers),
		}),
};
