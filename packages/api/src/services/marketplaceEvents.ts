import type { Payload } from "payload";
import type {
	NormalisedEvent,
	RefundEvent,
	TransferEvent,
} from "../lib/payments/marketplace";
import { relationId } from "../lib/relationId";
import { withTransaction } from "../lib/transactions";
import type { PaymentIntent } from "../payload-types";
import { applyAccountEvent } from "./connectedAccounts";
import { settlePayment } from "./payments";
import { applyFraudRules } from "./payoutHolds";
import { applyTransferEvent } from "./payouts";
import { applyDebitEvent, applyRefundEvent } from "./refunds";

/** Transfers with this prefix are P8's reseller payouts (`services/resellerPayouts.ts`). */
export const RESELLER_PAYOUT_REFERENCE_PREFIX = "RP-";

export interface DispatchResult {
	outcome: string;
	/** The settled intent, for a payment event; `processWebhookEvent` redacts by it. */
	intent: PaymentIntent | null;
}

const done = (outcome: string): DispatchResult => ({ outcome, intent: null });

async function dispatchRefund(
	payload: Payload,
	event: RefundEvent,
): Promise<DispatchResult> {
	const { outcome, refund } = await withTransaction(payload, (req) =>
		applyRefundEvent(req, event, { source: "webhook" }),
	);
	const shopId = refund ? relationId(refund.shop) : null;
	// Its own transaction, after the refund committed: a failing rule makes
	// the job retry, and the retried refund event is `unchanged`.
	if (shopId) {
		await withTransaction(payload, (req) =>
			applyFraudRules(req, { event: "refund", shopId }),
		);
	}
	return done(outcome);
}

async function dispatchTransfer(
	payload: Payload,
	event: TransferEvent,
): Promise<DispatchResult> {
	if ((event.reference ?? "").startsWith(RESELLER_PAYOUT_REFERENCE_PREFIX)) {
		payload.logger.info(
			{
				providerEventId: event.providerEventId,
				reference: event.reference,
				transferId: event.transferId,
			},
			"[webhooks] reseller payout transfer skipped until P8",
		);
		return done("skipped_reseller");
	}
	const result = await withTransaction(payload, (req) =>
		applyTransferEvent(req, event, { source: "webhook" }),
	);
	if (!result.applied) return done(result.reason);
	return done(result.changed ? "applied" : "unchanged");
}

/**
 * One provider fact, routed by its entity to the service that owns it. Every
 * applier is idempotent on its own record (intent charge posting, refund
 * row, payout row, account row, debit id), so a second event id carrying a
 * state change already applied writes nothing.
 */
export async function dispatchMarketplaceEvent(
	payload: Payload,
	event: NormalisedEvent,
): Promise<DispatchResult> {
	switch (event.entity) {
		case "payment": {
			if (!event.reference && !event.providerTransactionId)
				return done("ignored_without_reference");
			const settled = await settlePayment(payload, {
				...event,
				source: "webhook",
				failureCode: event.failureCode,
			});
			return {
				outcome: settled.outcome,
				intent: "intent" in settled ? settled.intent : null,
			};
		}
		case "refund":
			return dispatchRefund(payload, event);
		case "transfer":
			return dispatchTransfer(payload, event);
		case "account": {
			const account = await withTransaction(payload, (req) =>
				applyAccountEvent(req, event),
			);
			return done(account ? "applied" : "unknown_account");
		}
		case "debit": {
			const { outcome } = await withTransaction(payload, (req) =>
				applyDebitEvent(req, event, { source: "webhook" }),
			);
			return done(outcome);
		}
	}
}
