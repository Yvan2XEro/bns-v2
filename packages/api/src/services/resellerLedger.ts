import type { PayloadRequest } from "payload";
import type { LedgerTransactionKind } from "../collections/LedgerTransactions";
import { relationId } from "../lib/relationId";
import type { ResellerCommission, ResellerPayout } from "../payload-types";
import {
	findTransaction,
	ledgerIdempotencyKey,
	postingFor,
	postLedger,
} from "./ledger";

const CURRENCY = "XAF";

const posted = async (
	req: PayloadRequest,
	kind: LedgerTransactionKind,
	sourceId: string,
) =>
	Boolean(
		await findTransaction(
			req,
			ledgerIdempotencyKey({ kind, sourceId, sourceType: "resale-event" }),
		),
	);

/** The commission turned payable: the platform now owes the reseller its amount. */
export async function postCommissionPayable(
	req: PayloadRequest,
	commission: ResellerCommission,
): Promise<void> {
	if (commission.amount <= 0) return;
	await postLedger(req, {
		kind: "reseller_commission_payable",
		entries: postingFor("reseller_commission_payable", {
			amount: commission.amount,
		}),
		occurredAt: new Date(),
		sourceType: "resale-event",
		sourceId: String(commission.id),
		currency: CURRENCY,
		shop: relationId(commission.resellerShop) ?? undefined,
		order: relationId(commission.order) ?? undefined,
	});
}

/**
 * A refund or dispute cut an unpaid commission. Only an amount that was
 * posted payable can come back off it, and not while a payout holds the
 * commission: its amount already moved to in-transit with the payout.
 */
export async function postCommissionReduced(
	req: PayloadRequest,
	commission: ResellerCommission,
	reduction: number,
	adjustmentKey: string,
): Promise<void> {
	if (reduction <= 0 || relationId(commission.payout)) return;
	if (
		!(await posted(req, "reseller_commission_payable", String(commission.id)))
	) {
		return;
	}
	await postLedger(req, {
		kind: "reseller_commission_reduced",
		entries: postingFor("reseller_commission_reduced", { amount: reduction }),
		occurredAt: new Date(),
		sourceType: "resale-event",
		sourceId: `${commission.id}:${adjustmentKey}`,
		currency: CURRENCY,
		shop: relationId(commission.resellerShop) ?? undefined,
		order: relationId(commission.order) ?? undefined,
	});
}

const payoutPosting = (payout: ResellerPayout) => ({
	occurredAt: new Date(),
	sourceType: "resale-event" as const,
	sourceId: String(payout.id),
	currency: CURRENCY,
	shop: relationId(payout.resellerShop) ?? undefined,
});

const payoutAmounts = (payout: ResellerPayout) => ({
	gross: payout.grossAmount,
	offset: payout.offsetAmount ?? 0,
	amount: payout.amount,
});

/** The payout row exists: its commissions leave payable and sit in transit. */
export async function postPayoutSubmitted(
	req: PayloadRequest,
	payout: ResellerPayout,
): Promise<void> {
	await postLedger(req, {
		...payoutPosting(payout),
		kind: "reseller_payout_submitted",
		entries: postingFor("reseller_payout_submitted", payoutAmounts(payout)),
	});
}

/**
 * The transfer's final word. A payout older than the ledger has no
 * submitted posting, so nothing follows it; a reversal needs its completion.
 */
export async function postPayoutOutcome(
	req: PayloadRequest,
	payout: ResellerPayout,
	outcome: "complete" | "failed" | "reversed",
): Promise<void> {
	const id = String(payout.id);
	if (!(await posted(req, "reseller_payout_submitted", id))) return;
	const base = payoutPosting(payout);
	switch (outcome) {
		case "complete":
			await postLedger(req, {
				...base,
				kind: "reseller_payout_complete",
				entries: postingFor("reseller_payout_complete", {
					amount: payout.amount,
				}),
			});
			return;
		case "failed":
			await postLedger(req, {
				...base,
				kind: "reseller_payout_failed",
				entries: postingFor("reseller_payout_failed", payoutAmounts(payout)),
			});
			return;
		case "reversed":
			if (!(await posted(req, "reseller_payout_complete", id))) return;
			await postLedger(req, {
				...base,
				kind: "reseller_payout_reversed",
				entries: postingFor("reseller_payout_reversed", {
					gross: payout.grossAmount,
				}),
			});
			return;
	}
}
