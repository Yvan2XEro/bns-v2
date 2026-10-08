import type { Payload, PayloadRequest, Where } from "payload";
import {
	LEDGER_CATEGORY_TYPES,
	type LedgerAccountType,
	type LedgerCategory,
} from "../collections/LedgerAccounts";
import {
	type LEDGER_SOURCE_TYPES,
	type LedgerTransactionKind,
	ledgerEntriesProblem,
} from "../collections/LedgerTransactions";
import type { ProviderFeeBearer, ReleaseModel } from "../lib/paymentSettings";
import { RetryTransaction } from "../lib/transactions";
import type { LedgerAccount, LedgerTransaction } from "../payload-types";
import { isUniqueViolation } from "./shops";

/** Every ledger write carries it, so a hook can tell the one writer apart. */
export const LEDGER_CONTEXT = { ledgerService: true } as const;

export type LedgerSourceType = (typeof LEDGER_SOURCE_TYPES)[number];

/** One side of one posting line, named by category: the shop and currency come from the posting. */
export interface LedgerLine {
	category: LedgerCategory;
	debit: number;
	credit: number;
}

/** The categories that belong to one shop; every other account is the platform's. */
export const SELLER_CATEGORIES: readonly LedgerCategory[] = [
	"seller_pending",
	"seller_releasable",
	"seller_payout_in_transit",
	"seller_receivable",
	"reseller_commission_payable",
	"reseller_payout_in_transit",
];

const isSellerCategory = (category: LedgerCategory) =>
	SELLER_CATEGORIES.includes(category);

export function ledgerAccountKey(
	category: LedgerCategory,
	shopId: string | null | undefined,
	currency: string,
): string {
	return `${category}:${isSellerCategory(category) ? shopId : "platform"}:${currency}`;
}

const DEBIT_NORMAL: readonly LedgerAccountType[] = ["asset", "expense"];

/**
 * Balances are kept on each account's normal side, so a liability or revenue
 * reads positive when the platform owes or earned it. Σ(debit-normal) −
 * Σ(credit-normal) over every account is then zero for a balanced ledger.
 */
export function balanceDelta(
	category: LedgerCategory,
	debit: number,
	credit: number,
): number {
	return DEBIT_NORMAL.includes(LEDGER_CATEGORY_TYPES[category])
		? debit - credit
		: credit - debit;
}

const debit = (category: LedgerCategory, amount: number): LedgerLine => ({
	category,
	debit: amount,
	credit: 0,
});
const credit = (category: LedgerCategory, amount: number): LedgerLine => ({
	category,
	debit: 0,
	credit: amount,
});

/** One line per category and side, zero lines dropped (the schema refuses a line with no amount). */
function compact(lines: LedgerLine[]): LedgerLine[] {
	const merged = new Map<string, LedgerLine>();
	for (const line of lines) {
		const side = line.debit > 0 ? "d" : "c";
		if (line.debit === 0 && line.credit === 0) continue;
		const key = `${line.category}:${side}`;
		const existing = merged.get(key);
		if (existing) {
			existing.debit += line.debit;
			existing.credit += line.credit;
		} else {
			merged.set(key, { ...line });
		}
	}
	return [...merged.values()];
}

export interface RefundPostingAmounts {
	seller: number;
	commission: number;
	commissionVat: number;
	buyerProtectionFee: number;
	buyerProtectionFeeVat: number;
	/** What is still pending for the refunded order (`orderBalances(...).seller_pending`); the rest of `seller` becomes a receivable. */
	sellerPendingAvailable: number;
	/** Whether the order's `commission_earned` has been posted. */
	commissionEarned: boolean;
}

/** The inputs of each posting kind, named as `splitAmounts` and the `refunds.breakdown` group name them. */
export interface PostingAmounts {
	charge: {
		buyerTotal: number;
		destinationAmount: number;
		commission: number;
		commissionVat: number;
		buyerProtectionFee: number;
		buyerProtectionFeeVat: number;
	};
	provider_fee: { fee: number; bearer: ProviderFeeBearer };
	/** `amount` is D′: the order's remaining `seller_pending`. */
	release: { amount: number; releaseModel: ReleaseModel };
	/** C′, already net of what refunds reversed. */
	commission_earned: { commission: number; commissionVat: number };
	payout_submitted: { amount: number };
	payout_complete: { amount: number };
	payout_failed: { amount: number };
	/** The money actually came back from the connected account (reachable
	 * only from `complete`, after `payout_complete` already drained
	 * `seller_payout_in_transit` into `provider_position`), so it posts its
	 * own entries rather than `payout_failed`'s pre-completion reversal. */
	payout_reversed: { amount: number; releaseModel: ReleaseModel };
	refund_submitted: RefundPostingAmounts;
	refund_complete: { amount: number };
	/** The lines of the `refund_submitted` posting being reversed, as `transactionLines` reads them. */
	refund_failed: { submitted: readonly LedgerLine[] };
	clawback_recovered: {
		amount: number;
		from: "seller_pending" | "seller_releasable";
	};
	guarantee_writeoff: { amount: number };
	/** The lines of the `clawback_recovered` netting being reversed, as `transactionLines` reads them. */
	netting_reversed: { netting: readonly LedgerLine[] };
	reseller_commission_payable: { amount: number };
	reseller_commission_reduced: { amount: number };
	reseller_payout_submitted: ResellerPayoutAmounts;
	reseller_payout_failed: ResellerPayoutAmounts;
	reseller_payout_complete: { amount: number };
	/** Reachable only from `complete`; `gross` returns to payable, as the commissions do. */
	reseller_payout_reversed: { gross: number };
}

/** `amount` is what NotchPay is sent: `gross` commissions less the charges `offset` against them. */
export interface ResellerPayoutAmounts {
	gross: number;
	offset: number;
	amount: number;
}

type Postings = {
	[K in LedgerTransactionKind]: (amounts: PostingAmounts[K]) => LedgerLine[];
};

const payoutBack = ({ amount }: { amount: number }) => [
	debit("seller_payout_in_transit", amount),
	credit("seller_releasable", amount),
];

/** The spec's postings table, transcribed. */
const POSTINGS: Postings = {
	charge: (a) => [
		debit("provider_position", a.buyerTotal),
		credit("seller_pending", a.destinationAmount),
		credit("platform_fee_unearned", a.commission + a.commissionVat),
		credit(
			"platform_revenue_protection_fee",
			a.buyerProtectionFee - a.buyerProtectionFeeVat,
		),
		credit("vat_payable", a.buyerProtectionFeeVat),
	],
	provider_fee: ({ fee, bearer }) => [
		debit(
			bearer === "platform" ? "provider_fee_expense" : "seller_pending",
			fee,
		),
		credit("provider_position", fee),
	],
	release: ({ amount, releaseModel }) => [
		debit("seller_pending", amount),
		credit(
			releaseModel === "provider_hold"
				? "seller_releasable"
				: "seller_payout_in_transit",
			amount,
		),
	],
	commission_earned: ({ commission, commissionVat }) => [
		debit("platform_fee_unearned", commission + commissionVat),
		credit("platform_revenue_commission", commission),
		credit("vat_payable", commissionVat),
	],
	payout_submitted: ({ amount }) => [
		debit("seller_releasable", amount),
		credit("seller_payout_in_transit", amount),
	],
	payout_complete: ({ amount }) => [
		debit("seller_payout_in_transit", amount),
		credit("provider_position", amount),
	],
	payout_failed: payoutBack,
	// Reachable only from `complete`: `payout_complete` already moved the
	// amount out of `seller_payout_in_transit` into `provider_position`
	// (spent), so a later reversal must put it back on both sides — debiting
	// `provider_position` (the money really did return) and crediting the
	// bucket the amount would sit in if the payout had never gone out:
	// `seller_releasable` under `provider_hold` (another payout attempt is
	// possible), `seller_payout_in_transit` under `provider_schedule` (the
	// provider will resubmit on its own schedule). `payoutBack` would instead
	// drive `seller_payout_in_transit` to -amount forever.
	payout_reversed: ({ amount, releaseModel }) => [
		debit("provider_position", amount),
		credit(
			releaseModel === "provider_hold"
				? "seller_releasable"
				: "seller_payout_in_transit",
			amount,
		),
	],
	refund_submitted: (a) => {
		const fromPending = Math.min(
			a.seller,
			Math.max(a.sellerPendingAvailable, 0),
		);
		const total =
			a.seller + a.commission + a.commissionVat + a.buyerProtectionFee;
		return [
			debit("seller_pending", fromPending),
			debit("seller_receivable", a.seller - fromPending),
			...(a.commissionEarned
				? [
						debit("platform_revenue_commission", a.commission),
						debit("vat_payable", a.commissionVat),
					]
				: [debit("platform_fee_unearned", a.commission + a.commissionVat)]),
			debit(
				"platform_revenue_protection_fee",
				a.buyerProtectionFee - a.buyerProtectionFeeVat,
			),
			debit("vat_payable", a.buyerProtectionFeeVat),
			credit("buyer_refund_in_transit", total),
		];
	},
	refund_complete: ({ amount }) => [
		debit("buyer_refund_in_transit", amount),
		credit("provider_position", amount),
	],
	refund_failed: ({ submitted }) =>
		submitted.map((line) => ({
			category: line.category,
			debit: line.credit,
			credit: line.debit,
		})),
	clawback_recovered: ({ amount, from }) => [
		debit(from, amount),
		credit("seller_receivable", amount),
	],
	guarantee_writeoff: ({ amount }) => [
		debit("buyer_guarantee_expense", amount),
		credit("seller_receivable", amount),
	],
	netting_reversed: ({ netting }) =>
		netting.map((line) => ({
			category: line.category,
			debit: line.credit,
			credit: line.debit,
		})),
	reseller_commission_payable: ({ amount }) => [
		debit("provider_position", amount),
		credit("reseller_commission_payable", amount),
	],
	reseller_commission_reduced: ({ amount }) => [
		debit("reseller_commission_payable", amount),
		credit("provider_position", amount),
	],
	// The offset is cash the platform never receives from the supplier's
	// invoice (it went out as a P4 credit), so it leaves provider_position.
	reseller_payout_submitted: ({ gross, offset, amount }) => [
		debit("reseller_commission_payable", gross),
		credit("reseller_payout_in_transit", amount),
		credit("provider_position", offset),
	],
	reseller_payout_failed: ({ gross, offset, amount }) => [
		debit("reseller_payout_in_transit", amount),
		debit("provider_position", offset),
		credit("reseller_commission_payable", gross),
	],
	reseller_payout_complete: ({ amount }) => [
		debit("reseller_payout_in_transit", amount),
		credit("provider_position", amount),
	],
	// `complete` already drained in-transit into provider_position: the money
	// came back, so provider_position is debited, never in-transit credited.
	reseller_payout_reversed: ({ gross }) => [
		debit("provider_position", gross),
		credit("reseller_commission_payable", gross),
	],
};

/** Pure: one posting kind and its amounts in, the entries out. Balance is checked by `postLedger`, not here. */
export function postingFor<K extends LedgerTransactionKind>(
	kind: K,
	amounts: PostingAmounts[K],
): LedgerLine[] {
	const build: (amounts: PostingAmounts[K]) => LedgerLine[] = POSTINGS[kind];
	return compact(build(amounts));
}

export interface PostLedgerInput {
	kind: LedgerTransactionKind;
	occurredAt: Date | string;
	sourceType: LedgerSourceType;
	sourceId: string;
	currency: string;
	order?: string;
	/** Required as soon as a line names a seller category. */
	shop?: string;
	paymentIntent?: string;
	refund?: string;
	payout?: string;
	entries: readonly LedgerLine[];
	reverses?: string;
	memo?: string;
}

export interface PostLedgerResult {
	transaction: LedgerTransaction;
	/** False when the idempotency key had already been posted. */
	created: boolean;
}

export class LedgerPostingError extends Error {
	constructor(message: string) {
		super(`[ledger] ${message}`);
		this.name = "LedgerPostingError";
	}
}

export const ledgerIdempotencyKey = (
	input: Pick<PostLedgerInput, "kind" | "sourceId" | "sourceType">,
) => `${input.sourceType}:${input.sourceId}:${input.kind}`;

const idOf = (value: unknown): string =>
	value && typeof value === "object" && "id" in value
		? String(value.id)
		: String(value);

export async function findTransaction(
	req: PayloadRequest,
	idempotencyKey: string,
): Promise<LedgerTransaction | null> {
	const found = await req.payload.find({
		collection: "ledger-transactions",
		where: { idempotencyKey: { equals: idempotencyKey } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return found.docs[0] ?? null;
}

async function accountFor(
	req: PayloadRequest,
	category: LedgerCategory,
	shop: string | undefined,
	currency: string,
): Promise<LedgerAccount> {
	const key = ledgerAccountKey(category, shop, currency);
	const found = await req.payload.find({
		collection: "ledger-accounts",
		where: { key: { equals: key } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (found.docs[0]) return found.docs[0];
	try {
		return await req.payload.create({
			collection: "ledger-accounts",
			data: {
				key,
				category,
				type: LEDGER_CATEGORY_TYPES[category],
				...(isSellerCategory(category) ? { shop } : {}),
				currency,
				balance: 0,
			},
			overrideAccess: true,
			context: LEDGER_CONTEXT,
			req,
		});
	} catch (error) {
		// Inside a Mongo transaction a duplicate key aborts it: re-run, and the
		// re-read finds the account the concurrent writer created.
		if (isUniqueViolation(error)) {
			throw new RetryTransaction(`ledger account ${key} created concurrently`);
		}
		throw error;
	}
}

/**
 * The one writer of `ledger-transactions`. Runs inside the caller's
 * transaction (`req` from `withTransaction`): the posting and every balance
 * `$inc` commit or roll back with the event that caused them. A duplicate
 * idempotency key returns the stored posting and moves nothing.
 */
export async function postLedger(
	req: PayloadRequest,
	input: PostLedgerInput,
): Promise<PostLedgerResult> {
	const problem = ledgerEntriesProblem(
		input.entries.map((line) => ({ ...line, account: line.category })),
	);
	if (problem) throw new LedgerPostingError(problem);
	if (!input.shop && input.entries.some((l) => isSellerCategory(l.category))) {
		throw new LedgerPostingError("A seller account needs the posting's shop.");
	}

	const idempotencyKey = ledgerIdempotencyKey(input);
	const existing = await findTransaction(req, idempotencyKey);
	if (existing) return { transaction: existing, created: false };

	const accounts = new Map<LedgerCategory, LedgerAccount>();
	for (const { category } of input.entries) {
		if (!accounts.has(category)) {
			accounts.set(
				category,
				await accountFor(req, category, input.shop, input.currency),
			);
		}
	}
	const accountOf = (category: LedgerCategory) => {
		const account = accounts.get(category);
		if (!account) throw new LedgerPostingError(`no account for ${category}`);
		return account;
	};

	let transaction: LedgerTransaction;
	try {
		transaction = await req.payload.create({
			collection: "ledger-transactions",
			data: {
				idempotencyKey,
				kind: input.kind,
				occurredAt: new Date(input.occurredAt).toISOString(),
				postedAt: new Date().toISOString(),
				sourceType: input.sourceType,
				sourceId: input.sourceId,
				...(input.order ? { order: input.order } : {}),
				...(input.shop ? { shop: input.shop } : {}),
				...(input.paymentIntent ? { paymentIntent: input.paymentIntent } : {}),
				...(input.refund ? { refund: input.refund } : {}),
				...(input.payout ? { payout: input.payout } : {}),
				...(input.reverses ? { reverses: input.reverses } : {}),
				...(input.memo ? { memo: input.memo } : {}),
				entries: input.entries.map((line) => ({
					account: accountOf(line.category).id,
					debit: line.debit,
					credit: line.credit,
				})),
			},
			overrideAccess: true,
			context: LEDGER_CONTEXT,
			req,
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new RetryTransaction(
				`ledger ${idempotencyKey} posted concurrently`,
			);
		}
		throw error;
	}

	const deltas = new Map<string, number>();
	for (const line of input.entries) {
		const id = accountOf(line.category).id;
		deltas.set(
			id,
			(deltas.get(id) ?? 0) +
				balanceDelta(line.category, line.debit, line.credit),
		);
	}
	for (const [id, delta] of deltas) {
		if (delta === 0) continue;
		await req.payload.db.updateOne({
			collection: "ledger-accounts",
			id,
			data: { balance: { $inc: delta } },
			req,
			returning: false,
		});
	}

	return { transaction, created: true };
}

/** The cached balance of one account, on its normal side; 0 for an account never posted to. */
export async function accountBalance(
	payload: Payload,
	category: LedgerCategory,
	shopId: string | null,
	currency: string,
	req?: PayloadRequest,
): Promise<number> {
	const found = await payload.find({
		collection: "ledger-accounts",
		where: { key: { equals: ledgerAccountKey(category, shopId, currency) } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	return found.docs[0]?.balance ?? 0;
}

const PAGE = 500;

async function eachTransaction(
	payload: Payload,
	where: Where | undefined,
	req: PayloadRequest | undefined,
	visit: (transaction: LedgerTransaction) => void,
): Promise<void> {
	for (let page = 1; ; page++) {
		const batch = await payload.find({
			collection: "ledger-transactions",
			...(where ? { where } : {}),
			sort: "createdAt",
			limit: PAGE,
			page,
			depth: 0,
			overrideAccess: true,
			...(req ? { req } : {}),
		});
		for (const transaction of batch.docs) visit(transaction);
		if (!batch.hasNextPage) return;
	}
}

async function categoriesById(
	payload: Payload,
	req: PayloadRequest | undefined,
): Promise<Map<string, LedgerCategory>> {
	const accounts = await payload.find({
		collection: "ledger-accounts",
		pagination: false,
		depth: 0,
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	return new Map(accounts.docs.map((a) => [String(a.id), a.category]));
}

/** Every account's balance recomputed from the entries, by account id: what the caches must equal. */
export async function recomputeBalances(
	payload: Payload,
	req?: PayloadRequest,
): Promise<Map<string, number>> {
	const { accounts } = await ledgerIntegrity(payload, req);
	return new Map(
		accounts.map(({ account, recomputed }) => [String(account.id), recomputed]),
	);
}

export interface LedgerIntegrity {
	/** Every account with its cached balance (on the row) and the balance its entries give. */
	accounts: Array<{ account: LedgerAccount; recomputed: number }>;
	/** Stored postings whose sides differ: never edited, only reported. */
	unbalanced: Array<{ transaction: string; debit: number; credit: number }>;
}

/**
 * One pass over every posting. Run it inside a transaction when the caches
 * are to be corrected from it, so the read is one snapshot and a posting
 * landing meanwhile conflicts instead of being overwritten.
 */
export async function ledgerIntegrity(
	payload: Payload,
	req?: PayloadRequest,
): Promise<LedgerIntegrity> {
	const { docs } = await payload.find({
		collection: "ledger-accounts",
		pagination: false,
		depth: 0,
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	const categories = new Map(docs.map((a) => [String(a.id), a.category]));
	const balances = new Map<string, number>();
	for (const id of categories.keys()) balances.set(id, 0);
	const unbalanced: LedgerIntegrity["unbalanced"] = [];
	await eachTransaction(payload, undefined, req, (transaction) => {
		let debits = 0;
		let credits = 0;
		for (const entry of transaction.entries) {
			const id = idOf(entry.account);
			const category = categories.get(id);
			if (!category) throw new LedgerPostingError(`unknown account ${id}`);
			debits += entry.debit;
			credits += entry.credit;
			balances.set(
				id,
				(balances.get(id) ?? 0) +
					balanceDelta(category, entry.debit, entry.credit),
			);
		}
		if (debits !== credits) {
			unbalanced.push({
				transaction: String(transaction.id),
				debit: debits,
				credit: credits,
			});
		}
	});
	return {
		accounts: docs.map((account) => ({
			account,
			recomputed: balances.get(String(account.id)) ?? 0,
		})),
		unbalanced,
	};
}

/**
 * Sets a drifted cache to what its entries give. A compare-and-swap on the
 * cached value read: false when the balance moved since, and the next run
 * decides again. The postings themselves are never touched.
 */
export async function correctBalanceCache(
	req: PayloadRequest,
	accountId: string,
	cached: number,
	recomputed: number,
): Promise<boolean> {
	const swapped = await req.payload.db.updateOne({
		collection: "ledger-accounts",
		where: {
			and: [{ id: { equals: accountId } }, { balance: { equals: cached } }],
		},
		data: { balance: recomputed },
		req,
	});
	return Boolean(swapped);
}

/**
 * One order's net position per category, from its postings. `seller_pending`
 * is D′ — what `release` moves and what a refund can still take before the
 * rest becomes a receivable — because it nets out the seller-borne fee,
 * earlier refunds and clawbacks taken against this order alike.
 */
export async function orderBalances(
	req: PayloadRequest,
	orderId: string,
): Promise<Partial<Record<LedgerCategory, number>>> {
	return balancesWhere(req, { order: { equals: orderId } });
}

/** `orderBalances` for several orders in one pass; an order with no posting maps to `{}`. */
export async function balancesByOrder(
	req: PayloadRequest,
	orderIds: readonly string[],
): Promise<Map<string, Partial<Record<LedgerCategory, number>>>> {
	const result = new Map<string, Partial<Record<LedgerCategory, number>>>(
		orderIds.map((id) => [id, {}]),
	);
	if (orderIds.length === 0) return result;
	const categories = await categoriesById(req.payload, req);
	await eachTransaction(
		req.payload,
		{ order: { in: [...orderIds] } },
		req,
		(transaction) => {
			const totals = result.get(idOf(transaction.order));
			if (!totals) return;
			for (const entry of transaction.entries) {
				const category = categories.get(idOf(entry.account));
				if (!category) continue;
				totals[category] =
					(totals[category] ?? 0) +
					balanceDelta(category, entry.debit, entry.credit);
			}
		},
	);
	return result;
}

/**
 * The position of one payment intent's own postings. A duplicate or late
 * checkout payment is posted with the intent and no order (Task 14), so its
 * refund draws on this rather than on the order the buyer actually paid.
 */
export async function intentBalances(
	req: PayloadRequest,
	intentId: string,
): Promise<Partial<Record<LedgerCategory, number>>> {
	return balancesWhere(req, { paymentIntent: { equals: intentId } });
}

async function balancesWhere(
	req: PayloadRequest,
	where: Where,
): Promise<Partial<Record<LedgerCategory, number>>> {
	const categories = await categoriesById(req.payload, req);
	const totals: Partial<Record<LedgerCategory, number>> = {};
	await eachTransaction(req.payload, where, req, (transaction) => {
		for (const entry of transaction.entries) {
			const category = categories.get(idOf(entry.account));
			if (!category) continue;
			totals[category] =
				(totals[category] ?? 0) +
				balanceDelta(category, entry.debit, entry.credit);
		}
	});
	return totals;
}

/** A stored posting's lines by category, for `postingFor("refund_failed", { submitted })`. */
export async function transactionLines(
	req: PayloadRequest,
	transaction: LedgerTransaction,
): Promise<LedgerLine[]> {
	const categories = await categoriesById(req.payload, req);
	return transaction.entries.map((entry) => {
		const category = categories.get(idOf(entry.account));
		if (!category) {
			throw new LedgerPostingError(`unknown account ${idOf(entry.account)}`);
		}
		return { category, debit: entry.debit, credit: entry.credit };
	});
}
