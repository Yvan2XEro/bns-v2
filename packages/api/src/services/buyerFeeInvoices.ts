import type { PayloadRequest } from "payload";
import type { Order, PaymentIntent } from "../payload-types";

// --- Task 16's seam; Task 22 owns this file and replaces the body ---------
/**
 * The `completed` commission invoice of a `mobile_money` order (series `C`,
 * `settlement: application_fee`, `status: paid`). Called by
 * `services/payouts.ts` after the release posting commits, and again on every
 * retry of that handler, so Task 22's implementation must be idempotent per
 * order.
 */
export async function issueApplicationFeeCommissionInvoice(
	_req: PayloadRequest,
	_order: Order,
): Promise<void> {
	throw new Error(
		"services/buyerFeeInvoices.issueApplicationFeeCommissionInvoice lands with P5 Task 22",
	);
}

// --- Task 14's seam; Task 22 replaces the body ----------------------------
/**
 * The buyer protection fee invoice (series `F`) of the intent that paid the
 * order. Called by `services/checkoutSettlement.ts` in its own transaction
 * once the settlement has committed — only for the settling intent, never a
 * duplicate or a late payment, whose fee is refunded.
 */
export async function issueBuyerFeeInvoice(
	_req: PayloadRequest,
	_order: Order,
	_intent: PaymentIntent,
): Promise<void> {
	throw new Error(
		"services/buyerFeeInvoices.issueBuyerFeeInvoice lands with P5 Task 22",
	);
}
