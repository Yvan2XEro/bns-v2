import type { Payload, PayloadRequest, Where } from "payload";
import { withTransaction } from "../lib/transactions";
import type { Order } from "../payload-types";

/**
 * What the three order lifecycle sweeps (`expireOrders`, `failStaleOrders`,
 * `completeOrders`) and the dispatcher share: the queues they run on, the
 * batch size, the selection query and the per-order transaction. Each of
 * them holds no transition logic — this is the only code they have in
 * common, and a copy of it in each job is a copy that drifts.
 */

/** Drained every 5 minutes (`payload.config.ts`'s `autoRun`). */
export const ORDER_QUEUE = "orders";

/** Drained hourly (`payload.config.ts`'s `autoRun`). */
export const HOURLY_QUEUE = "hourly";

/**
 * One sweep's worth of orders per deadline, per run: whatever a run leaves
 * behind is picked up by the next one, rather than held in a single
 * unbounded loop.
 */
export const ORDER_BATCH_SIZE = 100;

export async function selectOrders(
	payload: Payload,
	where: Where,
): Promise<Order[]> {
	const { docs } = await payload.find({
		collection: "orders",
		where,
		depth: 0,
		limit: ORDER_BATCH_SIZE,
		sort: "createdAt",
		overrideAccess: true,
	});
	return docs;
}

/**
 * Runs `work` for each order in a transaction of its own and returns how
 * many of them failed. One order failing neither rolls back the orders
 * processed before it nor stops the ones after it: a job that batched them
 * into one transaction would lose a whole sweep to a single bad row.
 */
export async function eachOrder(
	payload: Payload,
	orders: readonly Order[],
	job: string,
	work: (req: PayloadRequest, order: Order) => Promise<void>,
): Promise<number> {
	let errors = 0;
	for (const order of orders) {
		try {
			await withTransaction(payload, (req) => work(req, order));
		} catch (error) {
			errors += 1;
			payload.logger.error(
				{ err: error, orderId: String(order.id) },
				`[orders] ${job} could not process an order`,
			);
		}
	}
	return errors;
}
