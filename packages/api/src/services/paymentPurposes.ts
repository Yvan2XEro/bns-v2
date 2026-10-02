import type { Payload } from "payload";
import type { TxReq } from "../lib/transactions";
import type { PaymentIntent } from "../payload-types";
import { activateBoostPayment, failBoostPayment } from "./boostActivation";

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
	// `PaymentIntent["purpose"]` already offers `commission` (the data model
	// declares the full option set now), but nothing creates a `commission`
	// intent yet — that is the commission-paying task's route. A no-op here
	// is reachable only once that task starts creating them, and it is the
	// one that replaces this entry with the settlement it describes.
	commission: {
		onSucceeded: async () => {
			// Reserved: no route creates a `commission` intent yet.
		},
		onFailed: async () => {
			// Reserved: no route creates a `commission` intent yet.
		},
	},
};
