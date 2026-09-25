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
};
