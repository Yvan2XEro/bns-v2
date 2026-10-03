import type { Payload, PayloadRequest } from "payload";
import type { PaymentIntent } from "../payload-types";
import { activateBoostPayment, failBoostPayment } from "./boostActivation";
import {
	alertCheckoutAmountMismatch,
	settleCheckoutIntent,
} from "./checkoutSettlement";
import { applyCommissionSettlement } from "./commission";

export interface ReportedAmount {
	amount: number | null;
	currency: string | null;
}

export interface PurposeHandler {
	onSucceeded(
		payload: Payload,
		intent: PaymentIntent,
		req: PayloadRequest,
	): Promise<void>;
	onFailed(
		payload: Payload,
		intent: PaymentIntent,
		req: PayloadRequest,
	): Promise<void>;
	/** A success on an intent already closed; without it, P0 ignores the report. */
	onLateSuccess?(
		payload: Payload,
		intent: PaymentIntent,
		req: PayloadRequest,
	): Promise<void>;
	onAmountMismatch?(
		payload: Payload,
		intent: PaymentIntent,
		reported: ReportedAmount,
		req: PayloadRequest,
	): Promise<void>;
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
	checkout: {
		onSucceeded: async (_payload, intent, req) => {
			await settleCheckoutIntent(req, intent);
		},
		onFailed: async (_payload, intent, req) => {
			await settleCheckoutIntent(req, intent);
		},
		onLateSuccess: async (_payload, intent, req) => {
			await settleCheckoutIntent(req, intent);
		},
		onAmountMismatch: (_payload, intent, reported, req) =>
			alertCheckoutAmountMismatch(req, intent, reported),
	},
};
