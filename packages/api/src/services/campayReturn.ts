import type { Payload } from "payload";
import { getProvider } from "../lib/payments";
import type { PaymentProvider, ProviderName } from "../lib/payments/types";
import {
	findIntentByReference,
	type SettleOutcome,
	settlePayment,
} from "./payments";

/** Our reference as we put it in a CamPay return URL: `PI-` and an id. */
const REFERENCE = /^PI-[A-Za-z0-9_-]{1,64}$/;

export type ReturnStatus = "success" | "pending" | "failed";

export function returnStatusOf(result: SettleOutcome | null): ReturnStatus {
	if (!result || result.outcome === "unknown_reference") return "failed";
	const { status } = result.intent;
	if (status === "succeeded") return "success";
	if (status === "pending" || status === "created") return "pending";
	return "failed";
}

/**
 * The payer is back from CamPay's page. CamPay appends nothing we can rely
 * on, so the return URL carries our reference; the intent it names must have
 * been opened with CamPay. The payment is read back from CamPay and settled
 * like any report (`source: "callback"`), in whichever order it and the
 * callback arrive. It never trusts the URL for the outcome.
 */
export async function settleCamPayReturn(
	payload: Payload,
	reference: string | null,
	deps: { getProvider: (name: ProviderName) => PaymentProvider } = {
		getProvider,
	},
): Promise<SettleOutcome | null> {
	if (!reference || !REFERENCE.test(reference)) return null;
	const intent = await findIntentByReference(payload, { reference });
	if (!intent || intent.provider !== "campay" || !intent.providerReference)
		return null;
	const verified = await deps
		.getProvider("campay")
		.verifyPayment(intent.providerReference);
	// CamPay's record must name this intent; anything else is not its payment.
	if (verified.reference && verified.reference !== intent.reference)
		return null;
	return settlePayment(payload, {
		...verified,
		reference: String(intent.reference),
		providerTransactionId: intent.providerReference,
		source: "callback",
	});
}

/** Only a seller-space path: the return URL must never become an open redirect. */
export function safeNextPath(next: string | null): string {
	if (next && /^\/seller(\/[A-Za-z0-9/_-]*)?$/.test(next)) return next;
	return "/seller/payments";
}
