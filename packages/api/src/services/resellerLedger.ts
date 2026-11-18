import type { Payload, PayloadRequest } from "payload";
import type { LedgerTransactionKind } from "../collections/LedgerTransactions";
import { relationId } from "../lib/relationId";
import type { ResellerCommission, ResellerPayout } from "../payload-types";
import {
	findTransaction,
	ledgerIdempotencyKey,
	postingFor,
	postLedger,
} from "./ledger";

/** A commission is money in its order's currency, whatever the reseller's own market. */
export async function orderCurrency(
	payload: Payload,
	orderId: string,
	req?: PayloadRequest,
): Promise<string> {
	const { docs } = await payload.find({
		collection: "orders",
		where: { id: { equals: orderId } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	const currency = docs[0]?.amounts?.currency;
	if (!currency) {
		throw new Error(`[reseller-ledger] order ${orderId} has no currency`);
	}
	return currency;
}

const commissionCurrency = (
	payload: Payload,
	commission: ResellerCommission,
	req?: PayloadRequest,
) => orderCurrency(payload, relationId(commission.order) ?? "", req);

/** A payout carries one currency: the one of the commissions it settles. */
export async function payoutCurrency(
	payload: Payload,
	payout: ResellerPayout,
	req?: PayloadRequest,
): Promise<string> {
	const first = relationId(payout.commissions?.[0]);
	if (!first) {
		throw new Error(
			`[reseller-ledger] payout ${payout.id} settles no commission`,
		);
	}
	const commission = await payload.findByID({
		collection: "reseller-commissions",
		id: first,
		depth: 0,
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	return commissionCurrency(payload, commission, req);
}

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
		currency: await commissionCurrency(req.payload, commission, req),
		shop: relationId(commission.resellerShop) ?? undefined,
		order: relationId(commission.order) ?? undefined,
	});
}

/**
 * A refund or dispute cut an unpaid commission. Only an amount that was
 * posted payable can come back off it. Under a holding payout the cut still
 * posts: payable dips by it, so a failed payout, which returns the gross,
 * lands on the net.
 */
export async function postCommissionReduced(
	req: PayloadRequest,
	commission: ResellerCommission,
	reduction: number,
	adjustmentKey: string,
): Promise<void> {
	if (reduction <= 0) return;
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
		currency: await commissionCurrency(req.payload, commission, req),
		shop: relationId(commission.resellerShop) ?? undefined,
		order: relationId(commission.order) ?? undefined,
	});
}

const payoutPosting = (payout: ResellerPayout, currency: string) => ({
	occurredAt: new Date(),
	sourceType: "resale-event" as const,
	sourceId: String(payout.id),
	currency,
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
		...payoutPosting(payout, await payoutCurrency(req.payload, payout, req)),
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
	const base = payoutPosting(
		payout,
		await payoutCurrency(req.payload, payout, req),
	);
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
