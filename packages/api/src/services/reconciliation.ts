import type { Payload, PayloadRequest, Where } from "payload";
import type { LedgerCategory } from "../collections/LedgerAccounts";
import type { LedgerTransactionKind } from "../collections/LedgerTransactions";
import type { RECONCILIATION_MISMATCH_KINDS } from "../collections/ReconciliationMismatches";
import {
	getPaymentSettings,
	type PaymentSettings,
} from "../lib/paymentSettings";
import {
	type MarketplaceProvider,
	type NormalisedDebitStatus,
	type NormalisedPayment,
	type NormalisedRefund,
	type NormalisedRefundStatus,
	type NormalisedTransaction,
	type NormalisedTransfer,
	type NormalisedTransferStatus,
	ProviderCapabilityError,
	ProviderRequestError,
	type RefundEvent,
	type TransferEvent,
} from "../lib/payments/marketplace";
import { getMarketplaceProvider } from "../lib/payments/marketplaceRegistry";
import type { ProviderPaymentStatus } from "../lib/payments/types";
import { transitionPath } from "../lib/paymentTransitions";
import { relationId } from "../lib/relationId";
import { withTransaction } from "../lib/transactions";
import type {
	PaymentIntent,
	Payout,
	ReconciliationMismatch,
	ReconciliationRun,
	Refund,
} from "../payload-types";
import { correctBalanceCache, ledgerIntegrity } from "./ledger";
import { notifyReconciliationAlert } from "./paymentNotifications";
import { PURPOSE_HANDLERS } from "./paymentPurposes";
import { findIntentByReference, settlePayment } from "./payments";
import { createHold } from "./payoutHolds";
import {
	applyTransferEvent,
	canMovePayout,
	mirrorCancelledTransfer,
	type PayoutStatus,
} from "./payouts";
import { applyRefundEvent, refundPath } from "./refunds";

/** Carried by every write this module makes outside the services it drives. */
export const RECONCILIATION_CONTEXT = { reconciliationService: true } as const;

/** The nightly run looks this far back: providers update late. */
export const RECONCILIATION_WINDOW_DAYS = 3;

export type MismatchKind = (typeof RECONCILIATION_MISMATCH_KINDS)[number];

export interface ReconciliationWindow {
	from: Date;
	to: Date;
}

export interface ReconciliationDeps {
	provider?: MarketplaceProvider;
	settings?: PaymentSettings;
	now?: Date;
}

export function reconciliationWindow(now = new Date()): ReconciliationWindow {
	return {
		from: new Date(now.getTime() - RECONCILIATION_WINDOW_DAYS * 86_400_000),
		to: now,
	};
}

// ─── Provider facts as service events ───────────────────────────────────────

/** A fetched refund as the event `applyRefundEvent` consumes; `eventId` names the cause. */
export function refundEventOf(
	refund: NormalisedRefund,
	eventId: string,
): RefundEvent {
	return {
		entity: "refund",
		providerEventId: eventId,
		type: `refund/${refund.status}`,
		reference: refund.idempotencyKey ?? "",
		amount: refund.amount,
		currency: refund.currency,
		providerTransactionId: null,
		status: refund.status,
		refundId: refund.refundId,
		paymentReference: refund.paymentReference,
		accountId: null,
		fee: null,
	};
}

/** A fetched transfer as the event `applyTransferEvent` consumes. */
export function transferEventOf(
	transfer: NormalisedTransfer,
	eventId: string,
): TransferEvent {
	return {
		entity: "transfer",
		providerEventId: eventId,
		type: `transfer/${transfer.status}`,
		reference: transfer.reference ?? "",
		amount: transfer.amount,
		currency: transfer.currency,
		providerTransactionId: null,
		status: transfer.status,
		transferId: transfer.transferId,
		accountId: transfer.accountId,
		fee: transfer.fee,
		failureReason: transfer.failureReason,
	};
}

/** A 4xx or an unsupported call: the provider cannot show it. An outage (5xx) is thrown on. */
export async function fetchOrNull<T>(
	fetch: () => Promise<T>,
): Promise<T | null> {
	try {
		return await fetch();
	} catch (error) {
		if (
			error instanceof ProviderRequestError ||
			error instanceof ProviderCapabilityError
		) {
			return null;
		}
		throw error;
	}
}

// ─── The run ────────────────────────────────────────────────────────────────

interface Tally {
	checked: number;
	matched: number;
	autoFixed: number;
	mismatches: number;
}

interface Run {
	payload: Payload;
	provider: MarketplaceProvider;
	settings: PaymentSettings;
	runId: string;
	now: Date;
	window: ReconciliationWindow;
	tally: Tally;
	newMismatches: number;
	/** Local rows a provider fact was compared with, so step 2 does not fetch them again. */
	seen: Set<string>;
}

/** The provider side of one comparison, listed or fetched. */
type Fact =
	| {
			entity: "payment";
			providerId: string;
			reference: string | null;
			amount: number | null;
			currency: string | null;
			status: ProviderPaymentStatus;
	  }
	| {
			entity: "refund";
			providerId: string;
			reference: string | null;
			amount: number;
			currency: string;
			status: NormalisedRefundStatus;
	  }
	| {
			entity: "transfer";
			providerId: string;
			reference: string | null;
			amount: number;
			currency: string;
			status: NormalisedTransferStatus;
	  }
	| {
			entity: "debit";
			providerId: string;
			reference: string | null;
			amount: number;
			status: NormalisedDebitStatus;
	  };

interface Finding {
	kind: MismatchKind;
	entityType: string;
	localId?: string | null;
	providerId?: string | null;
	expected?: unknown;
	actual?: unknown;
	shop?: string | null;
}

/**
 * One open mismatch per finding: an `open` (or `ignored`) row with the same
 * kind, entity and id — whichever run or service opened it, Task 14's
 * `amount_mismatch` and Task 15's `status_mismatch` included — is the same
 * finding seen again, and no row is added. A `resolved` one that recurs is new.
 */
async function openMismatch(
	run: Run,
	finding: Finding,
	req?: PayloadRequest,
): Promise<ReconciliationMismatch> {
	const { payload } = run;
	const identity: Where[] = finding.localId
		? [{ localId: { equals: finding.localId } }]
		: [{ providerId: { equals: finding.providerId ?? "" } }];
	const existing = await payload.find({
		collection: "reconciliation-mismatches",
		where: {
			and: [
				{ kind: { equals: finding.kind } },
				{ entityType: { equals: finding.entityType } },
				...identity,
				{ status: { in: ["open", "ignored"] } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	run.tally.mismatches += 1;
	if (existing.docs[0]) return existing.docs[0];
	run.newMismatches += 1;
	return payload.create({
		collection: "reconciliation-mismatches",
		data: { ...rowOf(run, finding), status: "open" },
		overrideAccess: true,
		context: RECONCILIATION_CONTEXT,
		...(req ? { req } : {}),
	});
}

/** The evidence of a fix: what the provider said, and what we had before applying it. */
async function autoFixed(
	run: Run,
	finding: Omit<Finding, "kind">,
	req: PayloadRequest,
): Promise<void> {
	run.tally.autoFixed += 1;
	await run.payload.create({
		collection: "reconciliation-mismatches",
		data: {
			...rowOf(run, { ...finding, kind: "missing_locally" }),
			status: "auto_fixed",
		},
		overrideAccess: true,
		context: RECONCILIATION_CONTEXT,
		req,
	});
}

function rowOf(run: Run, finding: Finding) {
	return {
		run: run.runId,
		kind: finding.kind,
		entityType: finding.entityType,
		...(finding.localId ? { localId: finding.localId } : {}),
		...(finding.providerId ? { providerId: finding.providerId } : {}),
		expected: (finding.expected ?? null) as ReconciliationMismatch["expected"],
		actual: (finding.actual ?? null) as ReconciliationMismatch["actual"],
		...(finding.shop ? { shop: finding.shop } : {}),
	};
}

const matched = (run: Run) => {
	run.tally.matched += 1;
};

async function postingCount(
	payload: Payload,
	field: "refund" | "payout",
	id: string,
	kind: LedgerTransactionKind,
	req?: PayloadRequest,
): Promise<number> {
	const { totalDocs } = await payload.count({
		collection: "ledger-transactions",
		where: { and: [{ [field]: { equals: id } }, { kind: { equals: kind } }] },
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	return totalDocs;
}

// ─── Step 1 and 2: payments ─────────────────────────────────────────────────

const intentShop = async (payload: Payload, intent: PaymentIntent) => {
	const order = await payload
		.findByID({
			collection: "orders",
			id: intent.targetId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	return relationId(order?.shop);
};

const isPaid = (intent: PaymentIntent) =>
	intent.status === "succeeded" || intent.lateSuccess === true;

/** Whether P0's state machine (with Task 14's late-success branch) can take this provider status. */
function paymentApplies(intent: PaymentIntent, status: ProviderPaymentStatus) {
	if (status === "succeeded" && !isPaid(intent)) {
		return (
			transitionPath(intent.status, "succeeded").length > 0 ||
			Boolean(PURPOSE_HANDLERS[intent.purpose].onLateSuccess)
		);
	}
	return transitionPath(intent.status, status).length > 0;
}

async function reconcilePayment(run: Run, fact: Fact & { entity: "payment" }) {
	const { payload, provider } = run;
	const intent = await findIntentByReference(payload, {
		reference: fact.reference,
		providerReference: fact.providerId,
	});
	if (!intent) {
		await openMismatch(run, {
			kind: "missing_locally",
			entityType: "payment-intent",
			providerId: fact.providerId,
			expected: null,
			actual: {
				reference: fact.reference,
				status: fact.status,
				amount: fact.amount,
				currency: fact.currency,
			},
		});
		return;
	}
	const localId = String(intent.id);
	run.seen.add(`payment-intent:${localId}`);
	const shop = await intentShop(payload, intent);
	const reference = intent.reference ?? `PI-${localId}`;

	const reportsAmount = fact.amount !== null || fact.status === "succeeded";
	if (
		reportsAmount &&
		(fact.amount !== intent.amount || fact.currency !== intent.currency)
	) {
		const finding: Finding = {
			kind: "amount_mismatch",
			entityType: "payment-intent",
			localId,
			providerId: intent.providerReference ?? fact.providerId,
			expected: { amount: intent.amount, currency: intent.currency },
			actual: { amount: fact.amount, currency: fact.currency },
			shop,
		};
		// Settlement's own branch (Task 14) opens this very row on a pending
		// intent: let it, once, and the lookup below finds its row.
		if (
			fact.status === "succeeded" &&
			!isPaid(intent) &&
			!(await hasOpen(payload, finding))
		) {
			const report = await fetchOrNull(() => provider.verifyPayment(reference));
			if (report) {
				await settlePayment(payload, {
					...report,
					source: "reconcile",
					at: run.now,
				});
			}
		}
		await openMismatch(run, finding);
		return;
	}

	if (
		fact.status === intent.status ||
		(fact.status === "succeeded" && intent.lateSuccess)
	) {
		return matched(run);
	}
	// A charge still pending at the provider has nothing to report yet, unless
	// we already hold its success.
	if (fact.status === "pending" && intent.status !== "succeeded") {
		return matched(run);
	}
	if (!paymentApplies(intent, fact.status)) {
		await openMismatch(run, {
			kind: "status_mismatch",
			entityType: "payment-intent",
			localId,
			providerId: intent.providerReference ?? fact.providerId,
			expected: { status: intent.status, lateSuccess: intent.lateSuccess },
			actual: { status: fact.status },
			shop,
		});
		return;
	}

	const report: NormalisedPayment | null = await fetchOrNull(() =>
		provider.verifyPayment(reference),
	);
	if (!report) {
		await openMismatch(run, {
			kind: "missing_locally",
			entityType: "payment-intent",
			localId,
			providerId: fact.providerId,
			expected: { status: fact.status },
			actual: { status: intent.status, fetched: false },
			shop,
		});
		return;
	}
	const settled = await settlePayment(payload, {
		...report,
		source: "reconcile",
		at: run.now,
	});
	if (settled.outcome === "applied" || settled.outcome === "late_success") {
		await withTransaction(payload, (req) =>
			autoFixed(
				run,
				{
					entityType: "payment-intent",
					localId,
					providerId: report.providerTransactionId ?? fact.providerId,
					expected: { status: report.status, amount: report.amount },
					actual: { status: intent.status },
					shop,
				},
				req,
			),
		);
		return;
	}
	await openMismatch(run, {
		kind:
			settled.outcome === "amount_mismatch"
				? "amount_mismatch"
				: "status_mismatch",
		entityType: "payment-intent",
		localId,
		providerId: intent.providerReference ?? fact.providerId,
		expected: { status: intent.status, amount: intent.amount },
		actual: { status: report.status, amount: report.amount },
		shop,
	});
}

async function hasOpen(payload: Payload, finding: Finding): Promise<boolean> {
	const { totalDocs } = await payload.count({
		collection: "reconciliation-mismatches",
		where: {
			and: [
				{ kind: { equals: finding.kind } },
				{ entityType: { equals: finding.entityType } },
				{ localId: { equals: finding.localId ?? "" } },
				{ status: { in: ["open", "ignored"] } },
			],
		},
		overrideAccess: true,
	});
	return totalDocs > 0;
}

// ─── Refunds ────────────────────────────────────────────────────────────────

async function findRefund(
	payload: Payload,
	fact: { reference: string | null; providerId: string },
): Promise<Refund | null> {
	const or: Where[] = [{ providerRefundId: { equals: fact.providerId } }];
	if (fact.reference) or.push({ idempotencyKey: { equals: fact.reference } });
	const { docs } = await payload.find({
		collection: "refunds",
		where: { or },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	return docs[0] ?? null;
}

/** Whether every posting the refund's status implies is on the ledger. */
async function refundPostingsComplete(
	payload: Payload,
	refund: Refund,
	req?: PayloadRequest,
) {
	const id = String(refund.id);
	const count = (kind: LedgerTransactionKind) =>
		postingCount(payload, "refund", id, kind, req);
	const submitted = await count("refund_submitted");
	switch (refund.status) {
		case "pending":
		case "processing":
			return submitted > 0;
		case "succeeded":
			return submitted > 0 && (await count("refund_complete")) > 0;
		case "failed":
			return submitted === 0 || (await count("refund_failed")) > 0;
		default:
			return true;
	}
}

async function reconcileRefund(run: Run, fact: Fact & { entity: "refund" }) {
	const { payload, provider } = run;
	const refund = await findRefund(payload, fact);
	if (!refund) {
		await openMismatch(run, {
			kind: "missing_locally",
			entityType: "refund",
			providerId: fact.providerId,
			expected: null,
			actual: {
				reference: fact.reference,
				status: fact.status,
				amount: fact.amount,
			},
		});
		return;
	}
	const localId = String(refund.id);
	run.seen.add(`refund:${localId}`);
	const shop = relationId(refund.shop);
	const providerId = refund.providerRefundId ?? fact.providerId;

	if (fact.amount !== refund.amount) {
		await openMismatch(run, {
			kind: "amount_mismatch",
			entityType: "refund",
			localId,
			providerId,
			expected: { amount: refund.amount },
			actual: { amount: fact.amount, currency: fact.currency },
			shop,
		});
		return;
	}
	const same = fact.status === refund.status;
	if (same && (await refundPostingsComplete(payload, refund))) {
		return matched(run);
	}
	if (!same && !refundPath(refund.status, fact.status)) {
		await openMismatch(run, {
			kind: "status_mismatch",
			entityType: "refund",
			localId,
			providerId,
			expected: { status: refund.status },
			actual: { status: fact.status, source: "reconcile" },
			shop,
		});
		return;
	}

	const fetched = await fetchOrNull(() => provider.getRefund(fact.providerId));
	if (!fetched) {
		await openMismatch(run, {
			kind: "missing_locally",
			entityType: "refund",
			localId,
			providerId,
			expected: { status: fact.status },
			actual: { status: refund.status, fetched: false },
			shop,
		});
		return;
	}
	const fixed = await withTransaction(payload, async (req) => {
		const { outcome, refund: after } = await applyRefundEvent(
			req,
			refundEventOf(fetched, `reconcile:${run.runId}`),
			{ source: "reconcile", now: run.now },
		);
		const done =
			outcome === "applied" ||
			(outcome === "unchanged" &&
				after !== null &&
				(await refundPostingsComplete(req.payload, after, req)));
		if (done) {
			await autoFixed(
				run,
				{
					entityType: "refund",
					localId,
					providerId: fetched.refundId,
					expected: { status: fetched.status, amount: fetched.amount },
					actual: { status: refund.status },
					shop,
				},
				req,
			);
		}
		return done;
	});
	if (fixed) return;
	await openMismatch(run, {
		kind: "status_mismatch",
		entityType: "refund",
		localId,
		providerId,
		expected: { status: refund.status },
		actual: { status: fetched.status, source: "reconcile" },
		shop,
	});
}

// ─── Transfers ──────────────────────────────────────────────────────────────

const PAYOUT_REFERENCE = /^PO-(.+)$/;
const RESELLER_PREFIX = "RP-";

async function findPayout(
	payload: Payload,
	fact: { reference: string | null; providerId: string },
): Promise<Payout | null> {
	const { docs } = await payload.find({
		collection: "payouts",
		where: { providerTransferId: { equals: fact.providerId } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	if (docs[0]) return docs[0];
	const match = PAYOUT_REFERENCE.exec(fact.reference ?? "");
	if (!match) return null;
	return payload
		.findByID({
			collection: "payouts",
			id: match[1],
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
}

const POSTED_BY_STATUS: Partial<
	Record<PayoutStatus, readonly LedgerTransactionKind[]>
> = {
	pending: ["payout_submitted"],
	sent: ["payout_submitted"],
	processing: ["payout_submitted"],
	complete: ["payout_submitted", "payout_complete"],
	reversed: ["payout_submitted", "payout_complete", "payout_reversed"],
};

/** Whether every posting the payout's status implies is on the ledger. */
async function payoutPostingsComplete(payload: Payload, payout: Payout) {
	const id = String(payout.id);
	if (payout.status === "failed") {
		if (payout.origin !== "platform_release") return true;
		return (
			(await postingCount(payload, "payout", id, "payout_submitted")) === 0 ||
			(await postingCount(payload, "payout", id, "payout_failed")) > 0
		);
	}
	const kinds = (POSTED_BY_STATUS[payout.status] ?? []).filter(
		(kind) =>
			payout.origin === "platform_release" || kind !== "payout_submitted",
	);
	for (const kind of kinds) {
		if ((await postingCount(payload, "payout", id, kind)) === 0) return false;
	}
	return true;
}

async function reconcileTransfer(
	run: Run,
	fact: Fact & { entity: "transfer" },
) {
	const { payload, provider } = run;
	const payout = await findPayout(payload, fact);
	const eventId = `reconcile:${run.runId}`;

	if (!payout) {
		const scheduledByProvider = !PAYOUT_REFERENCE.test(fact.reference ?? "");
		const fetched = scheduledByProvider
			? await fetchOrNull(() => provider.getTransfer(fact.providerId))
			: null;
		if (fetched) {
			const fixed = await withTransaction(payload, async (req) => {
				const outcome = await applyTransferEvent(
					req,
					transferEventOf(fetched, eventId),
					{ source: "reconcile", sourceId: run.runId },
				);
				if (!outcome.applied) return false;
				run.seen.add(`payout:${outcome.payout}`);
				await autoFixed(
					run,
					{
						entityType: "payout",
						localId: outcome.payout,
						providerId: fetched.transferId,
						expected: { status: fetched.status, amount: fetched.amount },
						actual: null,
					},
					req,
				);
				return true;
			});
			if (fixed) return;
		}
		await openMismatch(run, {
			kind: "missing_locally",
			entityType: "payout",
			providerId: fact.providerId,
			expected: null,
			actual: {
				reference: fact.reference,
				status: fact.status,
				amount: fact.amount,
			},
		});
		return;
	}

	const localId = String(payout.id);
	run.seen.add(`payout:${localId}`);
	const shop = relationId(payout.shop);

	// Task 16's concern 5: `submitPayout` cancelled the row on a failed call,
	// but the provider created the transfer anyway.
	if (payout.status === "cancelled" && !payout.providerTransferId) {
		const fetched = await fetchOrNull(() =>
			provider.getTransfer(fact.providerId),
		);
		const mirrored = fetched
			? await withTransaction(payload, async (req) => {
					const result = await mirrorCancelledTransfer(
						req,
						payout,
						transferEventOf(fetched, eventId),
						{ source: "reconcile", sourceId: run.runId },
					);
					if (!result.mirrored) return null;
					run.seen.add(`payout:${result.payout.id}`);
					await autoFixed(
						run,
						{
							entityType: "payout",
							localId: result.payout.id,
							providerId: fetched.transferId,
							expected: { status: fetched.status, amount: fetched.amount },
							actual: { status: "cancelled", payout: localId },
							shop,
						},
						req,
					);
					return result.payout.id;
				})
			: null;
		if (mirrored) return;
		await openMismatch(run, {
			kind: "missing_locally",
			entityType: "payout",
			localId,
			providerId: fact.providerId,
			expected: { status: fact.status, amount: fact.amount },
			actual: { status: "cancelled", fetched: fetched !== null },
			shop,
		});
		return;
	}

	if (fact.amount !== payout.amount) {
		await openMismatch(run, {
			kind: "amount_mismatch",
			entityType: "payout",
			localId,
			providerId: payout.providerTransferId ?? fact.providerId,
			expected: { amount: payout.amount },
			actual: { amount: fact.amount, currency: fact.currency },
			shop,
		});
		return;
	}
	const same = fact.status === payout.status;
	if (same && (await payoutPostingsComplete(payload, payout))) {
		return matched(run);
	}
	const from: PayoutStatus =
		payout.status === "scheduled" ? "pending" : payout.status;
	if (!same && from !== fact.status && !canMovePayout(from, fact.status)) {
		await openMismatch(run, {
			kind: "status_mismatch",
			entityType: "payout",
			localId,
			providerId: payout.providerTransferId ?? fact.providerId,
			expected: { status: payout.status },
			actual: { status: fact.status },
			shop,
		});
		return;
	}

	const fetched = await fetchOrNull(() =>
		provider.getTransfer(fact.providerId),
	);
	if (!fetched) {
		await openMismatch(run, {
			kind: "missing_locally",
			entityType: "payout",
			localId,
			providerId: fact.providerId,
			expected: { status: fact.status },
			actual: { status: payout.status, fetched: false },
			shop,
		});
		return;
	}
	const fixed = await withTransaction(payload, async (req) => {
		const outcome = await applyTransferEvent(
			req,
			transferEventOf(fetched, eventId),
			{ source: "reconcile", sourceId: run.runId },
		);
		if (!outcome.applied) return false;
		const after = await req.payload.findByID({
			collection: "payouts",
			id: localId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (after.status !== fetched.status) return false;
		await autoFixed(
			run,
			{
				entityType: "payout",
				localId,
				providerId: fetched.transferId,
				expected: { status: fetched.status, amount: fetched.amount },
				actual: { status: payout.status },
				shop,
			},
			req,
		);
		return true;
	});
	if (fixed) return;
	await openMismatch(run, {
		kind: "status_mismatch",
		entityType: "payout",
		localId,
		providerId: payout.providerTransferId ?? fact.providerId,
		expected: { status: payout.status },
		actual: { status: fetched.status },
		shop,
	});
}

// ─── Debits ─────────────────────────────────────────────────────────────────

/**
 * The port has no way to fetch a debit, so a succeeded clawback the ledger
 * does not mirror cannot be applied from here: it stays open for staff.
 */
async function reconcileDebit(run: Run, fact: Fact & { entity: "debit" }) {
	const recognised = (fact.reference ?? "").startsWith("CB-");
	if (recognised && fact.status !== "succeeded") return matched(run);
	if (recognised) {
		const { totalDocs } = await run.payload.count({
			collection: "ledger-transactions",
			where: {
				and: [
					{ kind: { equals: "clawback_recovered" } },
					{ sourceId: { equals: fact.providerId } },
				],
			},
			overrideAccess: true,
		});
		if (totalDocs > 0) return matched(run);
	}
	await openMismatch(run, {
		kind: "missing_locally",
		entityType: "debit",
		providerId: fact.providerId,
		expected: null,
		actual: {
			reference: fact.reference,
			status: fact.status,
			amount: fact.amount,
		},
	});
}

// ─── Step 1: provider to local ──────────────────────────────────────────────

function factOf(tx: NormalisedTransaction): Fact {
	switch (tx.entity) {
		case "payment":
			return { ...pick(tx), entity: "payment", status: tx.status };
		case "refund":
			return { ...pick(tx), entity: "refund", status: tx.status };
		case "transfer":
			return { ...pick(tx), entity: "transfer", status: tx.status };
		case "debit":
			return { ...pick(tx), entity: "debit", status: tx.status };
	}
}

const pick = (tx: NormalisedTransaction) => ({
	providerId: tx.providerId,
	reference: tx.reference,
	amount: tx.amount,
	currency: tx.currency,
});

async function listAll(
	provider: MarketplaceProvider,
	window: ReconciliationWindow,
	accountId?: string,
): Promise<NormalisedTransaction[]> {
	const rows: NormalisedTransaction[] = [];
	for (let page = 1; ; page++) {
		const batch = await provider.listTransactions({
			from: window.from,
			to: window.to,
			page,
			...(accountId ? { accountId } : {}),
		});
		if (batch.length === 0) return rows;
		rows.push(...batch);
	}
}

async function connectedAccounts(payload: Payload) {
	const { docs } = await payload.find({
		collection: "connected-accounts",
		where: { providerAccountId: { exists: true } },
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	return docs.flatMap((account) =>
		account.providerAccountId && relationId(account.shop)
			? [
					{
						accountId: account.providerAccountId,
						shop: relationId(account.shop) ?? "",
					},
				]
			: [],
	);
}

/** P8's reseller payouts (`RP-`) are not this ledger's: skipped, not counted. */
async function reconcileFact(run: Run, fact: Fact) {
	if ((fact.reference ?? "").startsWith(RESELLER_PREFIX)) return;
	run.tally.checked += 1;
	switch (fact.entity) {
		case "payment":
			return reconcilePayment(run, fact);
		case "refund":
			return reconcileRefund(run, fact);
		case "transfer":
			return reconcileTransfer(run, fact);
		case "debit":
			return reconcileDebit(run, fact);
	}
}

async function providerToLocal(
	run: Run,
	accounts: Array<{ accountId: string }>,
) {
	const facts = new Map<string, Fact>();
	const listings = [
		await listAll(run.provider, run.window),
		...(await Promise.all(
			accounts.map((a) => listAll(run.provider, run.window, a.accountId)),
		)),
	];
	for (const listing of listings) {
		for (const tx of listing) {
			const key = `${tx.entity}:${tx.providerId}`;
			if (!facts.has(key)) facts.set(key, factOf(tx));
		}
	}
	for (const fact of facts.values()) await reconcileFact(run, fact);
}

// ─── Step 2: local to provider ──────────────────────────────────────────────

function inWindow(run: Run): Where {
	return {
		and: [
			{ updatedAt: { greater_than_equal: run.window.from.toISOString() } },
			{ updatedAt: { less_than: run.window.to.toISOString() } },
		],
	};
}

async function missingAtProvider(
	run: Run,
	entityType: string,
	localId: string,
	providerId: string | null,
	expected: unknown,
	shop: string | null,
) {
	await openMismatch(run, {
		kind: "missing_at_provider",
		entityType,
		localId,
		providerId,
		expected,
		actual: null,
		shop,
	});
}

async function localToProvider(run: Run) {
	const { payload, provider } = run;
	const intents = await payload.find({
		collection: "payment-intents",
		where: {
			and: [
				{ purpose: { equals: "checkout" } },
				{
					or: [
						{ status: { equals: "succeeded" } },
						{ lateSuccess: { equals: true } },
					],
				},
				inWindow(run),
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	for (const intent of intents.docs) {
		if (run.seen.has(`payment-intent:${intent.id}`)) continue;
		const reference = intent.reference ?? `PI-${intent.id}`;
		const report = await fetchOrNull(() => provider.verifyPayment(reference));
		if (!report) {
			run.tally.checked += 1;
			await missingAtProvider(
				run,
				"payment-intent",
				String(intent.id),
				intent.providerReference ?? null,
				{ status: intent.status, amount: intent.amount },
				await intentShop(payload, intent),
			);
			continue;
		}
		await reconcileFact(run, {
			entity: "payment",
			providerId: report.providerTransactionId ?? reference,
			reference: report.reference,
			amount: report.amount,
			currency: report.currency,
			status: report.status,
		});
	}

	const refunds = await payload.find({
		collection: "refunds",
		where: { and: [{ status: { equals: "succeeded" } }, inWindow(run)] },
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	for (const refund of refunds.docs) {
		if (run.seen.has(`refund:${refund.id}`)) continue;
		const providerRefundId = refund.providerRefundId;
		const fetched = providerRefundId
			? await fetchOrNull(() => provider.getRefund(providerRefundId))
			: null;
		if (!fetched) {
			run.tally.checked += 1;
			await missingAtProvider(
				run,
				"refund",
				String(refund.id),
				providerRefundId ?? null,
				{ status: refund.status, amount: refund.amount },
				relationId(refund.shop),
			);
			continue;
		}
		await reconcileFact(run, {
			entity: "refund",
			providerId: fetched.refundId,
			reference: fetched.idempotencyKey,
			amount: fetched.amount,
			currency: fetched.currency,
			status: fetched.status,
		});
	}

	const payouts = await payload.find({
		collection: "payouts",
		where: { and: [{ status: { equals: "complete" } }, inWindow(run)] },
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	for (const payout of payouts.docs) {
		if (run.seen.has(`payout:${payout.id}`)) continue;
		const transferId = payout.providerTransferId;
		const fetched = transferId
			? await fetchOrNull(() => provider.getTransfer(transferId))
			: null;
		if (!fetched) {
			run.tally.checked += 1;
			await missingAtProvider(
				run,
				"payout",
				String(payout.id),
				transferId ?? null,
				{ status: payout.status, amount: payout.amount },
				relationId(payout.shop),
			);
			continue;
		}
		await reconcileFact(run, {
			entity: "transfer",
			providerId: fetched.transferId,
			reference: fetched.reference,
			amount: fetched.amount,
			currency: fetched.currency,
			status: fetched.status,
		});
	}
}

// ─── Step 4: ledger integrity ───────────────────────────────────────────────

/**
 * Recomputes every balance from the entries, in one transaction so the read
 * is a snapshot. A posting whose sides differ is reported and left exactly as
 * it is; a cache that drifted is reported and set back to its entries.
 */
async function ledgerCheck(run: Run) {
	await withTransaction(run.payload, async (req) => {
		const integrity = await ledgerIntegrity(run.payload, req);
		for (const broken of integrity.unbalanced) {
			run.tally.checked += 1;
			await openMismatch(
				run,
				{
					kind: "unbalanced_ledger",
					entityType: "ledger-transaction",
					localId: broken.transaction,
					expected: { debit: broken.debit, credit: broken.debit },
					actual: { debit: broken.debit, credit: broken.credit },
				},
				req,
			);
		}
		for (const { account, recomputed } of integrity.accounts) {
			run.tally.checked += 1;
			const cached = account.balance ?? 0;
			if (cached === recomputed) {
				matched(run);
				continue;
			}
			await correctBalanceCache(req, String(account.id), cached, recomputed);
			await openMismatch(
				run,
				{
					kind: "unbalanced_ledger",
					entityType: "ledger-account",
					localId: String(account.id),
					expected: { key: account.key, balance: recomputed },
					actual: { key: account.key, balance: cached },
					shop: relationId(account.shop),
				},
				req,
			);
		}
	});
}

// ─── Step 3: balances ───────────────────────────────────────────────────────

/**
 * What the shop's connected account should hold, by release model. Under
 * `provider_schedule` the provider pays on its own clock, so money it already
 * sent shows as a negative `seller_payout_in_transit` (Task 16's concern 2):
 * counting in-transit nets it out, before and after the order's `release`.
 */
function sellerCategories(settings: PaymentSettings): LedgerCategory[] {
	return settings.releaseModel === "provider_hold"
		? ["seller_pending", "seller_releasable"]
		: ["seller_pending", "seller_payout_in_transit"];
}

async function balanceCheck(
	run: Run,
	accounts: Array<{ accountId: string; shop: string }>,
) {
	const { payload, provider, settings } = run;
	const categories = sellerCategories(settings);
	for (const { accountId, shop } of accounts) {
		run.tally.checked += 1;
		const { docs } = await payload.find({
			collection: "ledger-accounts",
			where: {
				and: [{ shop: { equals: shop } }, { category: { in: categories } }],
			},
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		const local = docs.reduce(
			(sum, account) => sum + (account.balance ?? 0),
			0,
		);
		const balance = await fetchOrNull(() =>
			provider.getConnectedAccountBalance(accountId),
		);
		if (!balance) {
			await missingAtProvider(
				run,
				"connected-account",
				accountId,
				accountId,
				{ balance: local },
				shop,
			);
			continue;
		}
		const held = balance.available + balance.pending;
		if (Math.abs(held - local) < 1) {
			matched(run);
			continue;
		}
		await withTransaction(payload, async (req) => {
			const mismatch = await openMismatch(
				run,
				{
					kind: "balance_mismatch",
					entityType: "shop",
					localId: shop,
					providerId: accountId,
					expected: {
						amount: local,
						categories,
						releaseModel: settings.releaseModel,
					},
					actual: {
						amount: held,
						available: balance.available,
						pending: balance.pending,
					},
					shop,
				},
				req,
			);
			await createHold(req, {
				scope: "shop",
				shop,
				reason: "reconciliation_mismatch",
				createdByType: "system",
				note: `reconciliation mismatch ${mismatch.id}`,
			});
		});
	}
}

// ─── Step 5: the report ─────────────────────────────────────────────────────

async function alertStaff(run: Run) {
	const { docs } = await run.payload.find({
		collection: "reconciliation-mismatches",
		where: { status: { equals: "open" } },
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	if (docs.length === 0) return;
	const byKind: Partial<Record<MismatchKind, number>> = {};
	for (const row of docs) byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
	try {
		await notifyReconciliationAlert(run.payload, {
			runId: run.runId,
			openMismatches: docs.length,
			newMismatches: run.newMismatches,
			byKind,
		});
	} catch (error) {
		run.payload.logger.error(
			{ err: error, runId: run.runId },
			"[reconciliation] staff alert failed",
		);
	}
}

/**
 * The nightly reconciliation over `window`, in the spec's five steps:
 * provider → local (missing facts fetched and applied through the services
 * with `source: "reconcile"`), local → provider, the per-shop balances, the
 * ledger's integrity and the report. Ledger integrity runs before the
 * balances so a drifted cache cannot read as a shop's balance mismatch.
 * Idempotent: a second run over the same window finds what the first fixed
 * as matched and every open finding already recorded.
 */
export async function runReconciliation(
	payload: Payload,
	window: ReconciliationWindow,
	deps: ReconciliationDeps = {},
): Promise<ReconciliationRun> {
	const now = deps.now ?? new Date();
	const started = await payload.create({
		collection: "reconciliation-runs",
		data: {
			startedAt: now.toISOString(),
			window: {
				from: window.from.toISOString(),
				to: window.to.toISOString(),
			},
			status: "running",
		},
		overrideAccess: true,
		context: RECONCILIATION_CONTEXT,
	});
	const tally: Tally = { checked: 0, matched: 0, autoFixed: 0, mismatches: 0 };
	try {
		const settings = deps.settings ?? (await getPaymentSettings(payload));
		const run: Run = {
			payload,
			provider: deps.provider ?? getMarketplaceProvider(settings),
			settings,
			runId: String(started.id),
			now,
			window,
			tally,
			newMismatches: 0,
			seen: new Set(),
		};
		const accounts = await connectedAccounts(payload);
		await providerToLocal(run, accounts);
		await localToProvider(run);
		await ledgerCheck(run);
		await balanceCheck(run, accounts);
		const finished = await payload.update({
			collection: "reconciliation-runs",
			id: started.id,
			data: {
				status: "succeeded",
				finishedAt: new Date().toISOString(),
				counts: tally,
			},
			overrideAccess: true,
			context: RECONCILIATION_CONTEXT,
		});
		await alertStaff(run);
		return finished;
	} catch (error) {
		payload.logger.error(
			{ err: error, runId: started.id },
			"[reconciliation] run failed",
		);
		await payload.update({
			collection: "reconciliation-runs",
			id: started.id,
			data: {
				status: "failed",
				finishedAt: new Date().toISOString(),
				counts: tally,
				error: error instanceof Error ? error.message : String(error),
			},
			overrideAccess: true,
			context: RECONCILIATION_CONTEXT,
		});
		throw error;
	}
}

export interface ReconciliationReport {
	run: ReconciliationRun;
	mismatches: ReconciliationMismatch[];
}

/** The staff view: one run (the latest when none is named) and the rows it opened or fixed. */
export async function reconciliationReport(
	payload: Payload,
	runId?: string,
): Promise<ReconciliationReport | null> {
	const run = runId
		? await payload
				.findByID({
					collection: "reconciliation-runs",
					id: runId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null)
		: ((
				await payload.find({
					collection: "reconciliation-runs",
					sort: "-createdAt",
					limit: 1,
					depth: 0,
					overrideAccess: true,
				})
			).docs[0] ?? null);
	if (!run) return null;
	const { docs } = await payload.find({
		collection: "reconciliation-mismatches",
		where: { run: { equals: run.id } },
		sort: "createdAt",
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	return { run, mismatches: docs };
}
