import type { Payload, PayloadRequest } from "payload";
import type { LedgerTransactionKind } from "../collections/LedgerTransactions";
import type { MONEY_STATUS_SOURCES } from "../collections/Refunds";
import { ERROR_CODES } from "../lib/errors";
import { roundXaf } from "../lib/paymentMath";
import {
	getPaymentSettings,
	type PaymentSettings,
} from "../lib/paymentSettings";
import {
	type DebitEvent,
	type MarketplaceProvider,
	ProviderCapabilityError,
	ProviderRequestError,
	ProviderUnavailableError,
	type RefundEvent,
} from "../lib/payments/marketplace";
import { getMarketplaceProvider } from "../lib/payments/marketplaceRegistry";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	afterCommitScope,
	commitContextOf,
	onCommit,
	RetryTransaction,
	withTransaction,
} from "../lib/transactions";
import type {
	LedgerTransaction,
	Order,
	PaymentIntent,
	Refund,
} from "../payload-types";
import { creditNoteFor, issueBuyerFeeInvoice } from "./buyerFeeInvoices";
import {
	intentBalances,
	type LedgerSourceType,
	orderBalances,
	postingFor,
	postLedger,
	transactionLines,
} from "./ledger";
import { applyTransition, PAYMENT_TRANSITIONS } from "./orders/transitions";
import {
	notifyReceivableWrittenOff,
	notifyRefundCompleted,
	notifyRefundFailed,
	notifyRefundInitiated,
	notifyRefundStaffAlert,
	type RefundNoticeInput,
} from "./paymentNotifications";
import { activeHolds, createHold } from "./payoutHolds";
import { receivablesToBeNetted } from "./payouts";
import { isUniqueViolation } from "./shops";

/** Every refund-service write carries it (AGENTS.md: `overrideAccess` + a context flag). */
export const REFUND_CONTEXT = { refundService: true } as const;

/** The provider refuses refunds after 90 days; five days of margin. */
export const REFUND_WINDOW_DAYS = 85;
/** `submitRefund`'s first attempt plus its five retries. */
export const REFUND_SUBMIT_ATTEMPTS = 6;
export const REFUND_RETRY_DELAY_MS = 3_600_000;
/** At most this share of a new charge's destination amount goes to a clawback. */
export const CLAWBACK_SHARE_BPS = 5_000;
export const RECEIVABLE_WRITEOFF_DAYS = 60;
/** Debit references are `CB-{orderId}`: one clawback per new charge, deduplicated by the provider. */
export const CLAWBACK_REFERENCE_PREFIX = "CB-";

const DAY_MS = 86_400_000;

export type RefundStatus = Refund["status"];
export type RefundReason = Refund["reason"];
export type RefundSourceType = Refund["sourceType"];
export type MoneyStatusSource = (typeof MONEY_STATUS_SOURCES)[number];

export interface RefundBreakdown {
	seller: number;
	commission: number;
	commissionVat: number;
	buyerProtectionFee: number;
}

const PARTS = [
	"seller",
	"commission",
	"commissionVat",
	"buyerProtectionFee",
] as const satisfies readonly (keyof RefundBreakdown)[];

const ZERO: RefundBreakdown = {
	seller: 0,
	commission: 0,
	commissionVat: 0,
	buyerProtectionFee: 0,
};

const sumOf = (b: RefundBreakdown) =>
	b.seller + b.commission + b.commissionVat + b.buyerProtectionFee;

const minus = (a: RefundBreakdown, b: RefundBreakdown): RefundBreakdown => ({
	seller: a.seller - b.seller,
	commission: a.commission - b.commission,
	commissionVat: a.commissionVat - b.commissionVat,
	buyerProtectionFee: a.buyerProtectionFee - b.buyerProtectionFee,
});

/** What the buyer paid, by recipient: the four parts sum to `buyerTotal`. */
export function orderComponents(
	order: Pick<Order, "amounts">,
): RefundBreakdown {
	const a = order.amounts ?? {};
	return {
		seller: a.destinationAmount ?? 0,
		commission: a.commission ?? 0,
		commissionVat: a.commissionVat ?? 0,
		buyerProtectionFee: a.buyerProtectionFee ?? 0,
	};
}

export interface BreakdownInput {
	components: RefundBreakdown;
	/** The parts earlier live refunds of the same scope already took. */
	refunded: RefundBreakdown;
	/** The order's goods value (`amounts.subtotal`), the base the commission was charged on. */
	goodsValue: number;
	amount: number;
}

/**
 * The spec's default split. Refunding everything that remains returns every
 * remaining part, the protection fee included. A partial refund never touches
 * the fee: the commission parts are reversed in proportion to the refunded
 * goods value and the seller part carries the rest. Null when the amount is
 * more than the scope can give back that way.
 */
export function refundBreakdown({
	components,
	refunded,
	goodsValue,
	amount,
}: BreakdownInput): RefundBreakdown | null {
	const remaining = minus(components, refunded);
	const remainingTotal = sumOf(remaining);
	if (!Number.isInteger(amount) || amount <= 0 || amount > remainingTotal) {
		return null;
	}
	if (amount === remainingTotal) return remaining;

	const withoutFee =
		remaining.seller + remaining.commission + remaining.commissionVat;
	if (amount > withoutFee) return null;

	const ratio = goodsValue > 0 ? Math.min(amount / goodsValue, 1) : 1;
	let commission = Math.min(
		remaining.commission,
		roundXaf(components.commission * ratio),
	);
	let commissionVat = Math.min(
		remaining.commissionVat,
		roundXaf(components.commissionVat * ratio),
	);
	let seller = amount - commission - commissionVat;
	if (seller > remaining.seller) {
		let excess = seller - remaining.seller;
		seller = remaining.seller;
		const moreCommission = Math.min(excess, remaining.commission - commission);
		commission += moreCommission;
		excess -= moreCommission;
		commissionVat += excess;
	} else if (seller < 0) {
		commissionVat = Math.max(commissionVat + seller, 0);
		commission = amount - commissionVat;
		seller = 0;
	}
	return { seller, commission, commissionVat, buyerProtectionFee: 0 };
}

function breakdownOf(refund: Pick<Refund, "breakdown">): RefundBreakdown {
	const b = refund.breakdown ?? {};
	return {
		seller: b.seller ?? 0,
		commission: b.commission ?? 0,
		commissionVat: b.commissionVat ?? 0,
		buyerProtectionFee: b.buyerProtectionFee ?? 0,
	};
}

/** A refund for an intent that paid more than the order (duplicate, late) runs against that intent alone. */
const isIntentScoped = (sourceType: RefundSourceType) =>
	sourceType === "payment-intent";

const isPaid = (intent: PaymentIntent) =>
	intent.status === "succeeded" || intent.lateSuccess === true;

function paidAt(intent: PaymentIntent): Date {
	const succeeded = (intent.statusHistory ?? []).find(
		(entry) => entry.status === "succeeded",
	);
	return new Date(succeeded?.at ?? intent.updatedAt);
}

const refusal = (
	code:
		| typeof ERROR_CODES.refundAmountExceeds
		| typeof ERROR_CODES.refundNotRefundable
		| typeof ERROR_CODES.refundWindowExpired,
	message?: string,
) =>
	new ServiceError(
		code,
		code === ERROR_CODES.refundAmountExceeds ? 422 : 409,
		message,
	);

/** Joins the caller's `withTransaction`, or opens one when there is none to join. */
function inTransaction<T>(
	req: PayloadRequest,
	body: (req: PayloadRequest) => Promise<T>,
): Promise<T> {
	if (afterCommitScope(commitContextOf(req)) === "queued") return body(req);
	return withTransaction(req.payload, body, { user: req.user });
}

/** Provider calls and notices wait for the commit; a failure is logged, never thrown back. */
function afterCommit(req: PayloadRequest, work: () => Promise<unknown>): void {
	const run = async () => {
		try {
			await work();
		} catch (error) {
			req.payload.logger.error(
				{ err: error },
				"[refunds] after-commit work failed",
			);
		}
	};
	if (!onCommit(commitContextOf(req), run)) void run();
}

export type RefundSubmissionQueue = (
	payload: Payload,
	job: { refundId: string; waitUntil?: Date },
) => Promise<unknown>;

let submissionQueue: RefundSubmissionQueue | null = null;

/**
 * The jobs wiring (P5 Task 20) registers how `submitRefund` is queued — on
 * the `payments` queue — since the task slug is only typed once it is
 * registered. Returns the function that undoes it.
 */
export function registerRefundSubmissionQueue(
	queue: RefundSubmissionQueue,
): () => void {
	submissionQueue = queue;
	return () => {
		if (submissionQueue === queue) submissionQueue = null;
	};
}

function queueSubmission(
	req: PayloadRequest,
	refundId: string,
	waitUntil?: Date,
): void {
	afterCommit(req, async () => {
		if (!submissionQueue) {
			req.payload.logger.error(
				{ refundId },
				"[refunds] no submitRefund queue is registered; the refund waits as created",
			);
			return;
		}
		await submissionQueue(req.payload, {
			refundId,
			...(waitUntil ? { waitUntil } : {}),
		});
	});
}

async function loadOrder(req: PayloadRequest, id: string): Promise<Order> {
	return req.payload.findByID({
		collection: "orders",
		id,
		depth: 0,
		overrideAccess: true,
		req,
	});
}

async function loadIntent(
	req: PayloadRequest,
	id: string,
): Promise<PaymentIntent | null> {
	return req.payload
		.findByID({
			collection: "payment-intents",
			id,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
}

/**
 * The intent that paid the order: the one whose `charge` carries the order
 * (Task 14 tags only the settling payment), else the first that succeeded.
 * A late success never paid the order, whatever its creation date.
 */
async function settlingIntent(
	req: PayloadRequest,
	orderId: string,
): Promise<PaymentIntent | null> {
	const { docs: charges } = await req.payload.find({
		collection: "ledger-transactions",
		where: {
			and: [{ order: { equals: orderId } }, { kind: { equals: "charge" } }],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const charged = relationId(charges[0]?.paymentIntent);
	const { docs } = await req.payload.find({
		collection: "payment-intents",
		where: {
			and: [
				{ targetType: { equals: "order" } },
				{ targetId: { equals: orderId } },
				{ purpose: { equals: "checkout" } },
			],
		},
		sort: "createdAt",
		pagination: false,
		limit: 0,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return (
		docs.find((intent) => charged !== null && String(intent.id) === charged) ??
		docs.find((intent) => intent.status === "succeeded") ??
		null
	);
}

async function refundsWhere(
	req: PayloadRequest,
	where: NonNullable<Parameters<Payload["find"]>[0]["where"]>,
): Promise<Refund[]> {
	const { docs } = await req.payload.find({
		collection: "refunds",
		where,
		sort: "createdAt",
		pagination: false,
		limit: 0,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs;
}

/** Order-scoped refunds of `order` that still count: everything not failed. */
async function liveScopeRefunds(
	req: PayloadRequest,
	orderId: string,
	intentScope: string | null,
): Promise<Refund[]> {
	const rows = await refundsWhere(req, {
		and: [
			{ order: { equals: orderId } },
			{ status: { not_equals: "failed" } },
			intentScope
				? { sourceType: { equals: "payment-intent" } }
				: { sourceType: { not_equals: "payment-intent" } },
		],
	});
	return intentScope
		? rows.filter((r) => relationId(r.paymentIntent) === intentScope)
		: rows;
}

const totalOf = (rows: readonly Refund[]) =>
	rows.reduce(
		(acc, row) => {
			const b = breakdownOf(row);
			return {
				seller: acc.seller + b.seller,
				commission: acc.commission + b.commission,
				commissionVat: acc.commissionVat + b.commissionVat,
				buyerProtectionFee: acc.buyerProtectionFee + b.buyerProtectionFee,
			};
		},
		{ ...ZERO },
	);

/**
 * A compare-and-swap on the order's `updatedAt`: the refunded amount is read
 * and written inside one transaction, and a concurrent refund of the same
 * order must re-run against the winner's total, not overwrite it.
 */
async function writeRefundedAmount(
	req: PayloadRequest,
	order: Order,
	refundedAmount: number,
): Promise<void> {
	const written: unknown = await req.payload.db.updateOne({
		collection: "orders",
		where: {
			and: [
				{ id: { equals: String(order.id) } },
				{ updatedAt: { equals: order.updatedAt } },
			],
		},
		data: { settlement: { ...(order.settlement ?? {}), refundedAmount } },
		req,
		returning: true,
	});
	if (written === null || written === undefined) {
		throw new RetryTransaction(`order ${order.id} changed under a refund`);
	}
}

async function nextIdempotencyKey(
	req: PayloadRequest,
	sourceType: RefundSourceType,
	sourceId: string,
): Promise<string> {
	const { totalDocs } = await req.payload.count({
		collection: "refunds",
		where: {
			and: [
				{ sourceType: { equals: sourceType } },
				{ sourceId: { equals: sourceId } },
			],
		},
		overrideAccess: true,
		req,
	});
	return `${sourceType}:${sourceId}:${totalDocs + 1}`;
}

async function insertRefund(
	req: PayloadRequest,
	data: Omit<Refund, "id" | "createdAt" | "updatedAt">,
): Promise<Refund> {
	try {
		return await req.payload.create({
			collection: "refunds",
			data,
			overrideAccess: true,
			context: REFUND_CONTEXT,
			req,
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new RetryTransaction(`refund ${data.idempotencyKey} taken`);
		}
		throw error;
	}
}

export interface RequestRefundInput {
	order: string | Order;
	/** Omitted: everything that remains refundable in the scope. */
	amount?: number;
	breakdown?: RefundBreakdown;
	reason: RefundReason;
	/**
	 * `payment-intent` (with `sourceId` the intent) refunds a payment the
	 * order did not need — a duplicate or a late success — against that
	 * intent alone: it never counts in `settlement.refundedAmount` and never
	 * moves the order's `paymentStatus`. Every other source refunds the order.
	 */
	sourceType: RefundSourceType;
	sourceId: string;
}

/**
 * Creates the `refunds` row (`created`) and, for an order refund, raises
 * `settlement.refundedAmount` — one transaction, the caller's when it has one.
 * `submitRefund` is queued after commit. One live refund per source: asking
 * again while an earlier row for the same `{sourceType, sourceId}` is not
 * `failed` returns that row and writes nothing.
 */
export async function requestRefund(
	req: PayloadRequest,
	input: RequestRefundInput,
	deps: { now?: Date } = {},
): Promise<Refund> {
	const now = deps.now ?? new Date();
	const orderId =
		typeof input.order === "string" ? input.order : String(input.order.id);

	return inTransaction(req, async (tx) => {
		const live = await refundsWhere(tx, {
			and: [
				{ sourceType: { equals: input.sourceType } },
				{ sourceId: { equals: input.sourceId } },
				{ status: { not_equals: "failed" } },
			],
		});
		if (live[0]) return live[0];

		const order = await loadOrder(tx, orderId);
		const intentScoped = isIntentScoped(input.sourceType);
		const intent = intentScoped
			? await loadIntent(tx, input.sourceId)
			: await settlingIntent(tx, orderId);
		if (
			!intent ||
			!isPaid(intent) ||
			intent.targetType !== "order" ||
			intent.targetId !== orderId
		) {
			throw refusal(ERROR_CODES.refundNotRefundable);
		}
		if (
			now.getTime() - paidAt(intent).getTime() >
			REFUND_WINDOW_DAYS * DAY_MS
		) {
			throw refusal(ERROR_CODES.refundWindowExpired);
		}

		const components = orderComponents(order);
		const scope = await liveScopeRefunds(
			tx,
			orderId,
			intentScoped ? String(intent.id) : null,
		);
		const refunded = totalOf(scope);
		const remaining = sumOf(minus(components, refunded));
		const amount = input.amount ?? remaining;
		const buyerTotal = order.amounts?.total ?? sumOf(components);
		const alreadyRefunded = intentScoped
			? sumOf(refunded)
			: (order.settlement?.refundedAmount ?? 0);
		const ceiling =
			(intentScoped ? intent.amount : buyerTotal) - alreadyRefunded;
		if (!Number.isInteger(amount) || amount <= 0 || amount > ceiling) {
			throw refusal(ERROR_CODES.refundAmountExceeds);
		}

		const breakdown = input.breakdown
			? explicitBreakdown(input.breakdown, amount, components, refunded)
			: refundBreakdown({
					components,
					refunded,
					goodsValue:
						order.amounts?.subtotal ??
						buyerTotal - components.buyerProtectionFee,
					amount,
				});
		if (!breakdown) throw refusal(ERROR_CODES.refundAmountExceeds);

		const shop = relationId(order.shop);
		if (!intentScoped && shop) {
			const balances = await orderBalances(tx, orderId);
			if ((balances.seller_releasable ?? 0) > 0) {
				const holds = await activeHolds(
					tx.payload,
					{ shop, order: orderId },
					tx,
				);
				const covered = holds.some(
					(h) =>
						h.scope === "order" &&
						relationId(h.order) === orderId &&
						(h.reason === "return_open" || h.reason === "dispute_open"),
				);
				if (!covered) {
					throw refusal(
						ERROR_CODES.refundNotRefundable,
						"An order with releasable funds needs a return_open or dispute_open hold before a refund.",
					);
				}
			}
		}

		const buyer = relationId(order.buyer);
		const row = await insertRefund(tx, {
			order: orderId,
			paymentIntent: String(intent.id),
			...(buyer ? { buyer } : {}),
			...(shop ? { shop } : {}),
			amount,
			breakdown,
			reason: input.reason,
			sourceType: input.sourceType,
			sourceId: input.sourceId,
			status: "created",
			statusHistory: [
				{ status: "created", source: "system", at: now.toISOString() },
			],
			fundedBy: "connected_account",
			idempotencyKey: await nextIdempotencyKey(
				tx,
				input.sourceType,
				input.sourceId,
			),
			attempts: 0,
		});

		if (!intentScoped) {
			await writeRefundedAmount(tx, order, alreadyRefunded + amount);
		}

		queueSubmission(tx, String(row.id));
		afterCommit(tx, () =>
			notifyRefundInitiated(tx.payload, refundNotice(row, intent)),
		);
		return row;
	});
}

function explicitBreakdown(
	given: RefundBreakdown,
	amount: number,
	components: RefundBreakdown,
	refunded: RefundBreakdown,
): RefundBreakdown | null {
	const remaining = minus(components, refunded);
	const valid = PARTS.every(
		(part) =>
			Number.isInteger(given[part]) &&
			given[part] >= 0 &&
			given[part] <= remaining[part],
	);
	return valid && sumOf(given) === amount ? { ...given } : null;
}

function refundNotice(
	row: Refund,
	intent: Pick<PaymentIntent, "currency">,
): RefundNoticeInput {
	return {
		refundId: String(row.id),
		orderId: relationId(row.order) ?? "",
		buyerId: relationId(row.buyer),
		shopId: relationId(row.shop),
		amount: row.amount,
		currency: intent.currency,
		reason: row.reason,
	};
}

// --- The lifecycle -----------------------------------------------------------

/**
 * A refund that gave the buyer protection fee back — a full refund; a partial
 * one never touches the fee — credits the fee invoice (spec: "credit note on
 * refund"). Issuing the invoice first covers a refund that beat
 * settlement's own after-commit issue; both are idempotent per order. A
 * duplicate or late payment was never invoiced, so it has nothing to credit.
 */
function creditFeeAfterCommit(req: PayloadRequest, row: Refund): void {
	if (isIntentScoped(row.sourceType)) return;
	if ((row.breakdown?.buyerProtectionFee ?? 0) <= 0) return;
	afterCommit(req, () =>
		withTransaction(req.payload, async (tx) => {
			const intent = await loadIntent(tx, relationId(row.paymentIntent) ?? "");
			if (!intent) return;
			const order = await loadOrder(tx, relationId(row.order) ?? "");
			const invoice = await issueBuyerFeeInvoice(tx, order, intent);
			if (invoice) await creditNoteFor(tx, invoice, row);
		}),
	);
}

/** The spec's monotonic table. `created` is local; `succeeded` and `failed` are terminal. */
export const REFUND_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> =
	{
		created: ["pending", "failed"],
		pending: ["processing", "succeeded", "failed"],
		processing: ["succeeded", "failed"],
		succeeded: [],
		failed: [],
	};

/**
 * The steps from `from` to `to`, or null when the table forbids it. A
 * provider event can overtake the one before it (`complete` before
 * `created`): the provider's later state implies the earlier one, so a row
 * still `created` walks through `pending` rather than refusing the news.
 */
export function refundPath(
	from: RefundStatus,
	to: RefundStatus,
): RefundStatus[] | null {
	if (REFUND_TRANSITIONS[from].includes(to)) return [to];
	if (from === "created" && (to === "processing" || to === "succeeded")) {
		return ["pending", to];
	}
	return null;
}

interface LifecycleContext {
	/** `system` moves (our own submission) post nothing: every posting needs a provider fact. */
	source: MoneyStatusSource;
	ledgerSource: LedgerSourceType;
	now: Date;
	providerRefundId?: string;
	failureReason?: string | null;
	memo?: string;
}

async function postingOf(
	req: PayloadRequest,
	refundId: string,
	kind: LedgerTransactionKind,
): Promise<LedgerTransaction | null> {
	const { docs } = await req.payload.find({
		collection: "ledger-transactions",
		where: {
			and: [{ refund: { equals: refundId } }, { kind: { equals: kind } }],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs[0] ?? null;
}

/**
 * The nettings (`clawback_recovered`, payouts.ts's `nettingPosting`) posted
 * against this refund's own source — the same `{sourceType, sourceId}` a
 * `refund_submitted` carries, which `nettingPosting` copies verbatim. Never
 * the order: two refunds on one order each key their own netting, and a
 * failed one must reverse only its own.
 */
async function nettingsOf(
	req: PayloadRequest,
	sourceType: string,
	sourceId: string,
): Promise<LedgerTransaction[]> {
	const { docs } = await req.payload.find({
		collection: "ledger-transactions",
		where: {
			and: [
				{ kind: { equals: "clawback_recovered" } },
				{ sourceType: { equals: sourceType } },
				{ sourceId: { equals: sourceId } },
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs;
}

async function commissionEarned(
	req: PayloadRequest,
	orderId: string,
): Promise<boolean> {
	const { totalDocs } = await req.payload.count({
		collection: "ledger-transactions",
		where: {
			and: [
				{ order: { equals: orderId } },
				{ kind: { equals: "commission_earned" } },
			],
		},
		overrideAccess: true,
		req,
	});
	return totalDocs > 0;
}

/**
 * The postings a refund's status implies, each made once whichever event
 * (or reconciliation) gets there first: looked up by `{refund, kind}` so a
 * second cause never posts it again.
 */
async function ensurePostings(
	req: PayloadRequest,
	row: Refund,
	status: RefundStatus,
	ctx: LifecycleContext,
): Promise<void> {
	const refundId = String(row.id);
	const orderId = relationId(row.order) ?? "";
	const shop = relationId(row.shop) ?? undefined;
	const intentId = relationId(row.paymentIntent) ?? "";
	const intent = await loadIntent(req, intentId);
	const currency = intent?.currency;
	if (!currency) {
		throw new Error(`[refunds] refund ${refundId} has no intent currency`);
	}
	// A duplicate or late payment's charge carries no order (Task 14), so its
	// refund stays off the order's position too: tagging it would debit the
	// pending money of the payment the order really kept.
	const intentScoped = isIntentScoped(row.sourceType);
	const base = {
		occurredAt: ctx.now,
		sourceType: ctx.ledgerSource,
		sourceId: refundId,
		currency,
		...(intentScoped ? {} : { order: orderId }),
		...(shop ? { shop } : {}),
		paymentIntent: intentId,
		refund: refundId,
		...(ctx.memo ? { memo: ctx.memo } : {}),
	};

	const submitted = await postingOf(req, refundId, "refund_submitted");
	if (status === "failed") {
		if (!submitted || (await postingOf(req, refundId, "refund_failed"))) return;
		await postLedger(req, {
			...base,
			kind: "refund_failed",
			entries: postingFor("refund_failed", {
				submitted: await transactionLines(req, submitted),
			}),
			reverses: String(submitted.id),
		});
		// A refund netted before release (payouts.ts's `netReceivables`) that
		// then fails must give the netted money back: `refund_failed` alone
		// would otherwise leave the receivable at −r (P5's parked debt).
		for (const netting of await nettingsOf(
			req,
			submitted.sourceType,
			submitted.sourceId,
		)) {
			await postLedger(req, {
				...base,
				kind: "netting_reversed",
				entries: postingFor("netting_reversed", {
					netting: await transactionLines(req, netting),
				}),
				reverses: String(netting.id),
			});
		}
		return;
	}
	if (status === "created") return;

	if (!submitted) {
		const order = await loadOrder(req, orderId);
		const b = breakdownOf(row);
		const fee = order.amounts?.buyerProtectionFee ?? 0;
		const feeVat = order.amounts?.buyerProtectionFeeVat ?? 0;
		const balances = intentScoped
			? await intentBalances(req, intentId)
			: await orderBalances(req, orderId);
		await postLedger(req, {
			...base,
			kind: "refund_submitted",
			entries: postingFor("refund_submitted", {
				...b,
				buyerProtectionFeeVat:
					b.buyerProtectionFee === fee
						? feeVat
						: fee > 0
							? roundXaf((feeVat * b.buyerProtectionFee) / fee)
							: 0,
				sellerPendingAvailable: balances.seller_pending ?? 0,
				commissionEarned:
					!intentScoped && (await commissionEarned(req, orderId)),
			}),
		});
	}
	if (
		status === "succeeded" &&
		!(await postingOf(req, refundId, "refund_complete"))
	) {
		await postLedger(req, {
			...base,
			kind: "refund_complete",
			entries: postingFor("refund_complete", { amount: row.amount }),
		});
	}
}

/** A compare-and-swap on the row's status: the loser of two racing events re-runs against the winner. */
async function writeStatus(
	req: PayloadRequest,
	row: Refund,
	path: readonly RefundStatus[],
	ctx: LifecycleContext,
): Promise<Refund> {
	const at = ctx.now.toISOString();
	const to = path[path.length - 1] ?? row.status;
	const data = {
		status: to,
		statusHistory: [
			...(row.statusHistory ?? []),
			...path.map((status) => ({ status, source: ctx.source, at })),
		],
		...(ctx.providerRefundId && !row.providerRefundId
			? { providerRefundId: ctx.providerRefundId }
			: {}),
		...(to === "failed" && ctx.failureReason
			? { lastError: ctx.failureReason }
			: {}),
	};
	const written: unknown = await req.payload.db.updateOne({
		collection: "refunds",
		where: {
			and: [
				{ id: { equals: String(row.id) } },
				{ status: { equals: row.status } },
			],
		},
		data,
		req,
		returning: true,
	});
	if (written === null || written === undefined) {
		throw new RetryTransaction(`refund ${row.id} moved concurrently`);
	}
	return { ...row, ...data };
}

/** On success only: `refunded` once the order's succeeded refunds reach its total, else `partially_refunded`. */
async function settleOrderPaymentStatus(
	req: PayloadRequest,
	row: Refund,
	source: MoneyStatusSource,
): Promise<void> {
	if (isIntentScoped(row.sourceType)) return;
	const orderId = relationId(row.order) ?? "";
	const order = await loadOrder(req, orderId);
	const succeeded = await refundsWhere(req, {
		and: [
			{ order: { equals: orderId } },
			{ status: { equals: "succeeded" } },
			{ sourceType: { not_equals: "payment-intent" } },
		],
	});
	const total = order.amounts?.total ?? sumOf(orderComponents(order));
	const paid = succeeded.reduce((sum, r) => sum + r.amount, 0);
	const target = paid >= total ? "refunded" : "partially_refunded";
	if (order.paymentStatus === "refunded") return;
	if (!PAYMENT_TRANSITIONS[order.paymentStatus].includes(target)) {
		req.payload.logger.warn(
			{ orderId, paymentStatus: order.paymentStatus, target },
			"[refunds] the order's payment status cannot record this refund",
		);
		return;
	}
	await applyTransition(
		req,
		order,
		{ paymentStatus: target },
		{
			type: "order.note_added",
			actorType: "system",
			visibility: "staff",
			source: source === "webhook" ? "webhook" : "job",
			reason: "refund",
			note: `Refund ${row.idempotencyKey} succeeded: ${row.amount}.`,
			metadata: { refundId: String(row.id), amount: row.amount },
		},
	);
}

/**
 * The failure ladder. A first failure is retried once, an hour later, as a
 * fresh row (the next sequence of the same source: `failed` is terminal). A
 * retry that fails too goes to staff: an open `status_mismatch` and an alert,
 * and an order refund gives its amount back to `refundedAmount`.
 */
async function afterFailure(
	req: PayloadRequest,
	row: Refund,
	ctx: LifecycleContext,
): Promise<void> {
	const intent = await loadIntent(req, relationId(row.paymentIntent) ?? "");
	if (!row.retryOf) {
		const retry = await insertRefund(req, {
			order: relationId(row.order) ?? "",
			paymentIntent: relationId(row.paymentIntent) ?? "",
			...(relationId(row.buyer) ? { buyer: relationId(row.buyer) } : {}),
			...(relationId(row.shop) ? { shop: relationId(row.shop) } : {}),
			amount: row.amount,
			breakdown: breakdownOf(row),
			reason: row.reason,
			sourceType: row.sourceType,
			sourceId: row.sourceId,
			status: "created",
			statusHistory: [
				{ status: "created", source: "system", at: ctx.now.toISOString() },
			],
			fundedBy: row.fundedBy ?? "connected_account",
			idempotencyKey: await nextIdempotencyKey(
				req,
				row.sourceType,
				row.sourceId,
			),
			attempts: 0,
			retryOf: String(row.id),
		});
		queueSubmission(
			req,
			String(retry.id),
			new Date(ctx.now.getTime() + REFUND_RETRY_DELAY_MS),
		);
		return;
	}

	const mismatch = await req.payload.create({
		collection: "reconciliation-mismatches",
		data: {
			kind: "status_mismatch",
			entityType: "refund",
			localId: String(row.id),
			...(row.providerRefundId ? { providerId: row.providerRefundId } : {}),
			expected: { status: "succeeded", amount: row.amount },
			actual: { status: "failed", reason: ctx.failureReason ?? null },
			...(relationId(row.shop) ? { shop: relationId(row.shop) } : {}),
			status: "open",
		},
		overrideAccess: true,
		context: REFUND_CONTEXT,
		req,
	});
	if (!isIntentScoped(row.sourceType)) {
		const order = await loadOrder(req, relationId(row.order) ?? "");
		await writeRefundedAmount(
			req,
			order,
			Math.max((order.settlement?.refundedAmount ?? 0) - row.amount, 0),
		);
	}
	const notice = refundNotice(row, { currency: intent?.currency ?? "" });
	afterCommit(req, () =>
		notifyRefundStaffAlert(req.payload, {
			...notice,
			mismatchId: String(mismatch.id),
			failureReason: ctx.failureReason ?? null,
		}),
	);
	afterCommit(req, () => notifyRefundFailed(req.payload, notice));
}

export type RefundEventOutcome =
	| "applied"
	| "unchanged"
	| "stale"
	| "contradicted"
	| "unknown";

/** Moves `row` toward `target` and makes every effect of the move once. */
async function advance(
	req: PayloadRequest,
	row: Refund,
	target: RefundStatus,
	ctx: LifecycleContext,
): Promise<{ outcome: RefundEventOutcome; refund: Refund }> {
	if (row.status === target) {
		let current = row;
		if (ctx.providerRefundId && !row.providerRefundId) {
			current = await writeStatus(req, row, [], ctx);
		}
		if (ctx.source !== "system") {
			await ensurePostings(req, current, target, ctx);
		}
		return { outcome: "unchanged", refund: current };
	}
	const path = refundPath(row.status, target);
	if (!path) {
		const terminal = row.status === "succeeded" || row.status === "failed";
		const contradicts =
			terminal && (target === "succeeded" || target === "failed");
		if (contradicts) await contradiction(req, row, target, ctx);
		req.payload.logger.warn(
			{ refundId: row.id, from: row.status, to: target },
			"[refunds] refund event refused by the transition table",
		);
		return { outcome: contradicts ? "contradicted" : "stale", refund: row };
	}

	const moved = await writeStatus(req, row, path, ctx);
	if (ctx.source !== "system") await ensurePostings(req, moved, target, ctx);
	if (target === "succeeded") {
		await settleOrderPaymentStatus(req, moved, ctx.source);
		const intent = await loadIntent(req, relationId(moved.paymentIntent) ?? "");
		afterCommit(req, () =>
			notifyRefundCompleted(
				req.payload,
				refundNotice(moved, { currency: intent?.currency ?? "" }),
			),
		);
		creditFeeAfterCommit(req, moved);
	}
	if (target === "failed") await afterFailure(req, moved, ctx);
	return { outcome: "applied", refund: moved };
}

/** The provider reports the opposite terminal state: money may have moved, staff decide. */
async function contradiction(
	req: PayloadRequest,
	row: Refund,
	reported: RefundStatus,
	ctx: LifecycleContext,
): Promise<void> {
	const localId = String(row.id);
	const { totalDocs } = await req.payload.count({
		collection: "reconciliation-mismatches",
		where: {
			and: [
				{ entityType: { equals: "refund" } },
				{ localId: { equals: localId } },
				{ kind: { equals: "status_mismatch" } },
				{ status: { equals: "open" } },
			],
		},
		overrideAccess: true,
		req,
	});
	if (totalDocs > 0) return;
	await req.payload.create({
		collection: "reconciliation-mismatches",
		data: {
			kind: "status_mismatch",
			entityType: "refund",
			localId,
			...(row.providerRefundId || ctx.providerRefundId
				? { providerId: row.providerRefundId ?? ctx.providerRefundId }
				: {}),
			expected: { status: row.status },
			actual: { status: reported, source: ctx.source },
			...(relationId(row.shop) ? { shop: relationId(row.shop) } : {}),
			status: "open",
		},
		overrideAccess: true,
		context: REFUND_CONTEXT,
		req,
	});
}

async function rowForEvent(
	req: PayloadRequest,
	event: Pick<RefundEvent, "reference" | "refundId">,
): Promise<Refund | null> {
	const byKey = event.reference
		? await refundsWhere(req, { idempotencyKey: { equals: event.reference } })
		: [];
	if (byKey[0]) return byKey[0];
	const byId = event.refundId
		? await refundsWhere(req, { providerRefundId: { equals: event.refundId } })
		: [];
	return byId[0] ?? null;
}

export interface RefundEventOptions {
	/** `reconcile` when Task 18 applies what it fetched; the ledger cause follows. */
	source?: "webhook" | "reconcile";
	now?: Date;
}

/**
 * `refund/*` events, from a webhook or a reconciliation fetch. Matched by our
 * idempotency key (the event's `reference`), else by the provider's id.
 * Postings follow the status: `pending|processing` → `refund_submitted`,
 * `succeeded` → also `refund_complete`, `failed` → `refund_failed`
 * reversing a stored submission.
 */
export async function applyRefundEvent(
	req: PayloadRequest,
	event: RefundEvent,
	options: RefundEventOptions = {},
): Promise<{ outcome: RefundEventOutcome; refund: Refund | null }> {
	const source = options.source ?? "webhook";
	return inTransaction(req, async (tx) => {
		const row = await rowForEvent(tx, event);
		if (!row) {
			tx.payload.logger.warn(
				{ reference: event.reference, refundId: event.refundId },
				"[refunds] refund event for an unknown refund",
			);
			return { outcome: "unknown", refund: null };
		}
		return advance(tx, row, event.status, {
			source,
			ledgerSource:
				source === "reconcile" ? "reconciliation-run" : "webhook-event",
			now: options.now ?? new Date(),
			providerRefundId: event.refundId,
			memo: `event ${event.providerEventId}`,
		});
	});
}

export interface ProviderDeps {
	provider?: MarketplaceProvider;
	settings?: PaymentSettings;
	now?: Date;
}

async function providerOf(
	payload: Payload,
	deps: ProviderDeps,
): Promise<MarketplaceProvider> {
	if (deps.provider) return deps.provider;
	return getMarketplaceProvider(
		deps.settings ?? (await getPaymentSettings(payload)),
	);
}

const errorText = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

export interface SubmitRefundResult {
	status: RefundStatus;
	attempts: number;
}

/**
 * `submitRefund`'s unit of work. A row past `created` was already submitted
 * and is left alone. A provider outage is thrown back for the job's retry
 * until the last attempt, which — like a provider refusal — fails the row
 * into the failure ladder.
 */
export async function submitRefund(
	payload: Payload,
	refundId: string,
	deps: ProviderDeps = {},
): Promise<SubmitRefundResult> {
	const row = await payload.findByID({
		collection: "refunds",
		id: refundId,
		depth: 0,
		overrideAccess: true,
	});
	if (row.status !== "created") {
		return { status: row.status, attempts: row.attempts ?? 0 };
	}
	const intent = await payload.findByID({
		collection: "payment-intents",
		id: relationId(row.paymentIntent) ?? "",
		depth: 0,
		overrideAccess: true,
	});
	const attempts = (row.attempts ?? 0) + 1;
	await payload.db.updateOne({
		collection: "refunds",
		id: refundId,
		data: { attempts },
		returning: false,
	});

	const provider = await providerOf(payload, deps);
	const fail = (reason: string) =>
		withTransaction(payload, async (tx) => {
			const fresh = await tx.payload.findByID({
				collection: "refunds",
				id: refundId,
				depth: 0,
				overrideAccess: true,
				req: tx,
			});
			if (fresh.status !== "created") return fresh.status;
			const { refund } = await advance(tx, fresh, "failed", {
				source: "system",
				ledgerSource: "webhook-event",
				now: deps.now ?? new Date(),
				failureReason: reason,
			});
			return refund.status;
		});

	let response: Awaited<ReturnType<MarketplaceProvider["createRefund"]>>;
	try {
		response = await provider.createRefund({
			paymentReference: intent.reference ?? "",
			amount: row.amount,
			reason: row.reason,
			idempotencyKey: row.idempotencyKey,
		});
	} catch (error) {
		await payload.db.updateOne({
			collection: "refunds",
			id: refundId,
			data: { lastError: errorText(error) },
			returning: false,
		});
		if (
			error instanceof ProviderUnavailableError &&
			attempts < REFUND_SUBMIT_ATTEMPTS
		) {
			throw error;
		}
		if (
			error instanceof ProviderUnavailableError ||
			error instanceof ProviderRequestError ||
			error instanceof ProviderCapabilityError
		) {
			return { status: await fail(errorText(error)), attempts };
		}
		throw error;
	}

	const status = await withTransaction(payload, async (tx) => {
		const fresh = await tx.payload.findByID({
			collection: "refunds",
			id: refundId,
			depth: 0,
			overrideAccess: true,
			req: tx,
		});
		const ctx: LifecycleContext = {
			source: "system",
			ledgerSource: "webhook-event",
			now: deps.now ?? new Date(),
			providerRefundId: response.refundId,
		};
		if (fresh.status !== "created") {
			if (!fresh.providerRefundId) await writeStatus(tx, fresh, [], ctx);
			return fresh.status;
		}
		// Only `created → pending` is ours to write: what follows is the
		// provider's to report, through the events that carry the postings.
		const target = response.status === "failed" ? "failed" : "pending";
		const { refund } = await advance(tx, fresh, target, ctx);
		return refund.status;
	});
	return { status, attempts };
}

// --- Clawback and write-off -------------------------------------------------

export type DebitEventOutcome = "posted" | "duplicate" | "ignored";

/**
 * `debit/*` events. Only a succeeded clawback debit (`CB-{orderId}`) moves
 * the ledger: the receivable is paid from that order's pending funds, or its
 * releasable funds when it has been released since the debit was asked.
 */
export async function applyDebitEvent(
	req: PayloadRequest,
	event: DebitEvent,
	options: RefundEventOptions = {},
): Promise<{ outcome: DebitEventOutcome }> {
	const reference = event.reference ?? "";
	if (
		event.status !== "succeeded" ||
		!reference.startsWith(CLAWBACK_REFERENCE_PREFIX) ||
		!event.amount
	) {
		return { outcome: "ignored" };
	}
	const amount = event.amount;
	const orderId = reference.slice(CLAWBACK_REFERENCE_PREFIX.length);
	const source = options.source ?? "webhook";

	return inTransaction(req, async (tx) => {
		const { totalDocs } = await tx.payload.count({
			collection: "ledger-transactions",
			where: {
				and: [
					{ sourceId: { equals: event.debitId } },
					{ kind: { equals: "clawback_recovered" } },
				],
			},
			overrideAccess: true,
			req: tx,
		});
		if (totalDocs > 0) return { outcome: "duplicate" as const };

		const order = await loadOrder(tx, orderId);
		const shop = relationId(order.shop) ?? undefined;
		const currency = event.currency ?? order.amounts?.currency;
		if (!currency)
			throw new Error(`[refunds] debit ${event.debitId} has no currency`);
		const pending = (await orderBalances(tx, orderId)).seller_pending ?? 0;
		const { created } = await postLedger(tx, {
			kind: "clawback_recovered",
			occurredAt: options.now ?? new Date(),
			sourceType:
				source === "reconcile" ? "reconciliation-run" : "webhook-event",
			sourceId: event.debitId,
			currency,
			order: orderId,
			...(shop ? { shop } : {}),
			entries: postingFor("clawback_recovered", {
				amount,
				from: pending >= amount ? "seller_pending" : "seller_releasable",
			}),
			memo: `debit ${event.debitId} event ${event.providerEventId}`,
		});
		return { outcome: created ? ("posted" as const) : ("duplicate" as const) };
	});
}

interface ReceivablePiece {
	transaction: string;
	at: number;
	outstanding: number;
}

/**
 * The shop's receivable as dated pieces, oldest first: each debit to
 * `seller_receivable` opens one, each credit (recovery, write-off, reversed
 * refund) closes the oldest first.
 */
async function receivablePieces(
	payload: Payload,
	accountId: string,
	shop: string,
): Promise<ReceivablePiece[]> {
	const { docs } = await payload.find({
		collection: "ledger-transactions",
		where: { shop: { equals: shop } },
		sort: "occurredAt",
		pagination: false,
		limit: 0,
		depth: 0,
		overrideAccess: true,
	});
	const pieces: ReceivablePiece[] = [];
	let credits = 0;
	for (const tx of docs) {
		for (const entry of tx.entries) {
			if (relationId(entry.account) !== accountId) continue;
			if (entry.debit > 0) {
				pieces.push({
					transaction: String(tx.id),
					at: Date.parse(tx.occurredAt),
					outstanding: entry.debit,
				});
			}
			credits += entry.credit;
		}
	}
	return consume(pieces, credits);
}

function consume(pieces: ReceivablePiece[], amount: number): ReceivablePiece[] {
	let left = amount;
	const open: ReceivablePiece[] = [];
	for (const piece of pieces) {
		const taken = Math.min(piece.outstanding, left);
		left -= taken;
		if (piece.outstanding - taken > 0) {
			open.push({ ...piece, outstanding: piece.outstanding - taken });
		}
	}
	return open;
}

/**
 * Takes out of each piece what the next payout batch will net from its own
 * order's unpaid releasable money (`receivablesToBeNetted`): a refund after
 * `release` on an order not yet paid out is covered by funds the provider
 * still holds, so debiting it from a later charge, or writing it off, would
 * make the seller pay it twice.
 */
async function withoutNettable(
	payload: Payload,
	pieces: ReceivablePiece[],
): Promise<ReceivablePiece[]> {
	if (pieces.length === 0) return pieces;
	return withTransaction(payload, async (req) => {
		const byOrder = new Map<string, Map<string, number>>();
		const open: ReceivablePiece[] = [];
		for (const piece of pieces) {
			const posting = await req.payload.findByID({
				collection: "ledger-transactions",
				id: piece.transaction,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const orderId = relationId(posting.order);
			let covered = 0;
			if (posting.kind === "refund_submitted" && orderId) {
				let nettable = byOrder.get(orderId);
				if (!nettable) {
					nettable = await receivablesToBeNetted(req, orderId);
					byOrder.set(orderId, nettable);
				}
				covered = nettable.get(piece.transaction) ?? 0;
			}
			const outstanding =
				piece.outstanding - Math.min(covered, piece.outstanding);
			if (outstanding > 0) open.push({ ...piece, outstanding });
		}
		return open;
	});
}

interface ClawbackDebit {
	orderId: string;
	amount: number;
	status: string;
}

/** Clawback debits the provider knows for the account since `from`, by our `CB-` reference. */
async function clawbackDebits(
	provider: MarketplaceProvider,
	accountId: string,
	from: Date,
	to: Date,
): Promise<ClawbackDebit[]> {
	const found: ClawbackDebit[] = [];
	for (let page = 1; ; page++) {
		const batch = await provider.listTransactions({
			from,
			to,
			page,
			accountId,
		});
		if (batch.length === 0) return found;
		for (const tx of batch) {
			if (tx.entity !== "debit") continue;
			const reference = tx.reference ?? "";
			if (!reference.startsWith(CLAWBACK_REFERENCE_PREFIX)) continue;
			found.push({
				orderId: reference.slice(CLAWBACK_REFERENCE_PREFIX.length),
				amount: tx.amount,
				status: tx.status,
			});
		}
	}
}

export interface RecoverReceivablesResult {
	debits: Array<{
		shop: string;
		order: string;
		amount: number;
		reference: string;
	}>;
	writeOffs: Array<{ shop: string; amount: number; transaction: string }>;
	suspended: string[];
	failed: string[];
}

/**
 * The daily `recoverSellerReceivables` logic, per shop owing money: pieces
 * older than 60 days are written off to `buyer_guarantee_expense` and the
 * shop's protected payment is suspended (a charge-blocking shop hold); the
 * rest is asked back by `debitConnectedAccount` from the shop's later
 * charges, at most half of each charge's destination amount and never more
 * than that order still has pending. Debits still in flight at the provider
 * count as already recovered, so a slow debit is never asked twice.
 */
export async function recoverSellerReceivables(
	payload: Payload,
	deps: ProviderDeps = {},
): Promise<RecoverReceivablesResult> {
	const now = deps.now ?? new Date();
	const result: RecoverReceivablesResult = {
		debits: [],
		writeOffs: [],
		suspended: [],
		failed: [],
	};
	const { docs: accounts } = await payload.find({
		collection: "ledger-accounts",
		where: {
			and: [
				{ category: { equals: "seller_receivable" } },
				{ balance: { greater_than: 0 } },
			],
		},
		pagination: false,
		limit: 0,
		depth: 0,
		overrideAccess: true,
	});
	const provider = accounts.length > 0 ? await providerOf(payload, deps) : null;

	for (const account of accounts) {
		const shop = relationId(account.shop);
		if (!shop || !provider) continue;
		try {
			await recoverShop(payload, provider, {
				shop,
				accountId: String(account.id),
				currency: account.currency,
				now,
				result,
			});
		} catch (error) {
			result.failed.push(shop);
			payload.logger.error(
				{ err: error, shop },
				"[recoverSellerReceivables] shop recovery failed",
			);
		}
	}
	return result;
}

async function recoverShop(
	payload: Payload,
	provider: MarketplaceProvider,
	input: {
		shop: string;
		accountId: string;
		currency: string;
		now: Date;
		result: RecoverReceivablesResult;
	},
): Promise<void> {
	const { shop, now, result } = input;
	let pieces = await receivablePieces(payload, input.accountId, shop);
	if (pieces.length === 0) return;

	const { docs: connected } = await payload.find({
		collection: "connected-accounts",
		where: {
			and: [
				{ shop: { equals: shop } },
				{ providerAccountId: { exists: true } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const providerAccountId = connected[0]?.providerAccountId ?? null;
	const since = new Date(pieces[0]?.at ?? now.getTime());
	const known = providerAccountId
		? await clawbackDebits(
				provider,
				providerAccountId,
				since,
				new Date(now.getTime() + 1),
			)
		: [];
	const inFlight = known
		.filter((d) => d.status === "pending")
		.reduce((sum, d) => sum + d.amount, 0);
	pieces = await withoutNettable(payload, consume(pieces, inFlight));

	const cutoff = now.getTime() - RECEIVABLE_WRITEOFF_DAYS * DAY_MS;
	const stale = pieces.filter((p) => p.at <= cutoff);
	if (stale.length > 0) {
		const amount = stale.reduce((sum, p) => sum + p.outstanding, 0);
		await withTransaction(payload, async (req) => {
			for (const piece of stale) {
				const { transaction } = await postLedger(req, {
					kind: "guarantee_writeoff",
					occurredAt: now,
					sourceType: "reconciliation-run",
					sourceId: `receivable:${piece.transaction}`,
					currency: input.currency,
					shop,
					entries: postingFor("guarantee_writeoff", {
						amount: piece.outstanding,
					}),
					memo: `receivable unrecovered after ${RECEIVABLE_WRITEOFF_DAYS} days`,
				});
				result.writeOffs.push({
					shop,
					amount: piece.outstanding,
					transaction: String(transaction.id),
				});
			}
			const hold = await createHold(req, {
				scope: "shop",
				shop,
				reason: "fraud_signal",
				createdByType: "system",
				note: `Seller receivable of ${amount} ${input.currency} written off; protected payment suspended.`,
			});
			afterCommit(req, () =>
				notifyReceivableWrittenOff(payload, {
					shopId: shop,
					amount,
					currency: input.currency,
					holdId: String(hold.id),
				}),
			);
		});
		result.suspended.push(shop);
		pieces = pieces.filter((p) => p.at > cutoff);
	}

	let remaining = pieces.reduce((sum, p) => sum + p.outstanding, 0);
	const recoverFrom = pieces[0]?.at;
	if (remaining <= 0 || !providerAccountId || recoverFrom === undefined) return;

	const debited = new Set(known.map((d) => d.orderId));
	// Read in a transaction for one consistent view; the debits go out after it.
	const candidates = await withTransaction(payload, async (req) => {
		const { docs: charges } = await req.payload.find({
			collection: "ledger-transactions",
			where: {
				and: [
					{ shop: { equals: shop } },
					{ kind: { equals: "charge" } },
					{ occurredAt: { greater_than: new Date(recoverFrom).toISOString() } },
				],
			},
			sort: "occurredAt",
			pagination: false,
			limit: 0,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const found: Array<{ orderId: string; cap: number; pending: number }> = [];
		for (const charge of charges) {
			const orderId = relationId(charge.order);
			if (!orderId || debited.has(orderId)) continue;
			const destination = (await transactionLines(req, charge))
				.filter((l) => l.category === "seller_pending")
				.reduce((sum, l) => sum + l.credit, 0);
			found.push({
				orderId,
				cap: Math.floor((destination * CLAWBACK_SHARE_BPS) / 10_000),
				pending: (await orderBalances(req, orderId)).seller_pending ?? 0,
			});
		}
		return found;
	});

	for (const { orderId, cap, pending } of candidates) {
		if (remaining <= 0) break;
		const amount = Math.min(remaining, cap, pending);
		if (amount <= 0) continue;
		const reference = `${CLAWBACK_REFERENCE_PREFIX}${orderId}`;
		try {
			await provider.debitConnectedAccount(providerAccountId, {
				amount,
				reference,
				description: "Recovery of a refund the seller's funds did not cover",
			});
		} catch (error) {
			if (error instanceof ProviderRequestError && error.status === 409)
				continue;
			if (error instanceof ProviderCapabilityError) {
				payload.logger.warn(
					{ shop },
					"[recoverSellerReceivables] the provider cannot debit connected accounts",
				);
				return;
			}
			throw error;
		}
		remaining -= amount;
		result.debits.push({ shop, order: orderId, amount, reference });
	}
}
