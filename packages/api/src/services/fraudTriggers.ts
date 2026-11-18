import type { Payload } from "payload";
import { withTransaction } from "../lib/transactions";
import type { Order, OrderEvent } from "../payload-types";
import { registerOrderEventHandler } from "./orders/events";
import { applyFraudRules } from "./payoutHolds";

/**
 * The fixed fraud rules' order triggers (Task 11), fed from P4's registry. P4
 * has no `order.paid` type: settlement writes the `placed → paid` change as an
 * `order.note_added` with reason `payment_succeeded` (checkoutSettlement.ts).
 * The `refund` trigger runs from the webhook dispatch (marketplaceEvents.ts).
 */
export async function fraudRulesOnOrderPaid(
	payload: Payload,
	order: Order,
	event: OrderEvent,
): Promise<void> {
	if (event.reason !== "payment_succeeded") return;
	await withTransaction(payload, (req) =>
		applyFraudRules(req, { event: "order.paid", orderId: String(order.id) }),
	);
}

export async function fraudRulesOnOrderCompleted(
	payload: Payload,
	order: Order,
): Promise<void> {
	await withTransaction(payload, (req) =>
		applyFraudRules(req, {
			event: "order.completed",
			orderId: String(order.id),
		}),
	);
}

/** Called at module load; re-call after `__resetOrderEventHandlers`. */
export function registerFraudTriggers(): () => void {
	const offPaid = registerOrderEventHandler(
		"order.note_added",
		fraudRulesOnOrderPaid,
	);
	const offCompleted = registerOrderEventHandler(
		"order.completed",
		fraudRulesOnOrderCompleted,
	);
	return () => {
		offPaid();
		offCompleted();
	};
}

registerFraudTriggers();
