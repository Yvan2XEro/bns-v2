import type { Payload, PayloadRequest } from "payload";
import { commitContextOf, onCommit } from "../../lib/transactions";
import type { Order, OrderEvent } from "../../payload-types";

/**
 * A handler reacts to one order event type. It never writes `orders`,
 * `order-items` or `order-events` itself — `transitions.ts` is the only
 * writer of those — but it is free to write anything else (stock, commission
 * lines, SMS, search, Novu) because `queueOrderEvent` only ever calls it
 * after the transition's own transaction has committed.
 */
export type OrderEventHandler = (
	payload: Payload,
	order: Order,
	event: OrderEvent,
) => Promise<void> | void;

const handlers = new Map<string, OrderEventHandler[]>();

/**
 * Events already dispatched, by `OrderEvent.id`. `order-events` is
 * append-only and one transition writes exactly one event row, so the id is
 * a stable idempotency key: a courier's "mark delivered" retried after a
 * dropped response must produce one sale and one commission line, not two.
 * Membership is global rather than per-call because the thing being guarded
 * against is a second *dispatch* of the same already-written event, which by
 * definition cannot come from the call that first dispatched it.
 */
const dispatched = new Set<string>();

/** Registers `handler` for `type`. Returns the function that undoes it. */
export function registerOrderEventHandler(
	type: string,
	handler: OrderEventHandler,
): () => void {
	const list = handlers.get(type) ?? [];
	list.push(handler);
	handlers.set(type, list);
	return () => {
		const current = handlers.get(type);
		if (!current) return;
		const index = current.indexOf(handler);
		if (index >= 0) current.splice(index, 1);
	};
}

/** Test-only: handlers and the dispatch log are module state. */
export function __resetOrderEventHandlers(): void {
	handlers.clear();
	dispatched.clear();
}

export interface RunOrderEventHandlersOptions {
	/**
	 * Run only the handlers carrying these names — `dispatchOrderEvent`'s
	 * retry, which passes back the names a previous attempt reported as
	 * failed. Naming them also waives the `event.id` guard below: the retry
	 * *is* the continuation of the dispatch that claimed the id, and the
	 * handlers it names are exactly the ones that never completed.
	 */
	only?: readonly string[];
}

/**
 * Runs every handler registered for `event.type`, each in its own `try` so
 * one failure never stops the rest, and returns the names of the handlers
 * that failed. A second call for the same `event.id` — whether the first
 * call fully succeeded or partly failed — is a no-op: re-running a handler
 * that already sold stock or wrote a commission line would duplicate the
 * very effect this registry exists to make idempotent, so the id is claimed
 * before any handler runs rather than after all of them succeed.
 */
export async function runOrderEventHandlers(
	payload: Payload,
	order: Order,
	event: OrderEvent,
	options: RunOrderEventHandlersOptions = {},
): Promise<string[]> {
	const only = options.only?.length ? new Set(options.only) : null;
	if (!only) {
		if (dispatched.has(event.id)) return [];
		dispatched.add(event.id);
	}

	const failed: string[] = [];
	for (const handler of handlers.get(event.type) ?? []) {
		if (only && !only.has(handler.name || "anonymous")) continue;
		try {
			await handler(payload, order, event);
		} catch (error) {
			failed.push(handler.name || "anonymous");
			payload.logger.error(
				{ err: error, type: event.type, eventId: event.id },
				"[orders] event handler failed",
			);
		}
	}
	return failed;
}

async function dispatchOrderEvent(
	payload: Payload,
	order: Order,
	event: OrderEvent,
): Promise<void> {
	await runOrderEventHandlers(payload, order, event);
}

/**
 * Queues `dispatchOrderEvent` for after the caller's transaction commits, so
 * no handler can ever observe an order whose own write has not landed yet —
 * SMS, Novu, Redis and the search index all go through this, never a direct
 * call. Outside a transaction (`req` from `withTransaction`'s `none`/`foreign`
 * scopes) there is no commit to wait for, so the work runs immediately.
 */
export function queueOrderEvent(
	req: PayloadRequest,
	order: Order,
	event: OrderEvent,
): void {
	const work = () => dispatchOrderEvent(req.payload, order, event);
	if (!onCommit(commitContextOf(req), work)) void work();
}
