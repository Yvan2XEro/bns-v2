import type { Payload } from "payload";
import type { TxReq } from "../lib/transactions";
import type { PaymentIntent } from "../payload-types";
import { activateBoostPayment, failBoostPayment } from "./boostActivation";
import { applyCommissionSettlement } from "./commission";

export interface PurposeHandler {
	onSucceeded(
		payload: Payload,
		intent: PaymentIntent,
		req: TxReq,
	): Promise<void>;
	onFailed(payload: Payload, intent: PaymentIntent, req: TxReq): Promise<void>;
}

export const PURPOSE_HANDLERS: Record<
	PaymentIntent["purpose"],
	PurposeHandler
> = {
	boost: {
		onSucceeded: async (payload, intent, req) => {
			await activateBoostPayment(payload, intent.targetId, req);
		},
		onFailed: async (payload, intent, req) => {
			await failBoostPayment(payload, intent.targetId, req);
		},
	},
	commission: {
		onSucceeded: async (payload, intent, req) => {
			await applyCommissionSettlement(payload, intent, req);
		},
		onFailed: async () => {
			// A failed commission payment leaves the invoice exactly as it was
			// (issued/overdue): there is nothing to roll back, and the shop can
			// retry through `payInvoice`.
		},
	},
	// Fails loud until P5's checkout settlement is wired in (Task 14): an
	// error rolls the transition back and leaves the webhook event to be
	// retried, where a silent no-op would mark a paid order's intent settled
	// without ever touching the order.
	checkout: {
		onSucceeded: async () => {
			throw new Error("checkout intents are not settled yet");
		},
		onFailed: async () => {
			throw new Error("checkout intents are not settled yet");
		},
	},
};
