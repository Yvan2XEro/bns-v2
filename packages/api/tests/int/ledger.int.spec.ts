// @vitest-environment node
import type { PayloadRequest } from "payload";
import { describe, expect, it } from "vitest";
import {
	LEDGER_CATEGORY_TYPES,
	type LedgerCategory,
} from "../../src/collections/LedgerAccounts";
import {
	LEDGER_TRANSACTION_KINDS,
	type LedgerTransactionKind,
} from "../../src/collections/LedgerTransactions";
import { splitAmounts } from "../../src/lib/paymentMath";
import {
	DEFAULT_MARKETS,
	PAYMENT_DEFAULTS,
	type ReleaseModel,
} from "../../src/lib/paymentSettings";
import { withTransaction } from "../../src/lib/transactions";
import type { LedgerAccount, LedgerTransaction } from "../../src/payload-types";
import {
	accountBalance,
	type LedgerLine,
	ledgerAccountKey,
	orderBalances,
	type PostLedgerInput,
	postingFor,
	postLedger,
	recomputeBalances,
	transactionLines,
} from "../../src/services/ledger";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

const MARKET = DEFAULT_MARKETS[0];
const CURRENCY = MARKET.currency;
const SHOP = "shop-1";

const split = (orderTotal: number, commission: number) =>
	splitAmounts({
		orderTotal,
		commission,
		vatRateBps: MARKET.vatRateBps,
		protection: PAYMENT_DEFAULTS.buyerProtection,
	});

/** The worked order: 47,000 of goods, 3,760 commission TTC, 1,410 protection fee. */
const ORDER = split(47_000, 3_153);
const G = ORDER.buyerTotal;
const D = ORDER.destinationAmount;
const C = ORDER.commission + ORDER.commissionVat;
const P = ORDER.buyerProtectionFee;
const PV = ORDER.buyerProtectionFeeVat;
const FEE = 1_210;

const ledger = () =>
	fakePayload(
		{},
		{
			uniques: {
				"ledger-accounts": [["key"]],
				"ledger-transactions": [["idempotencyKey"]],
			},
		},
	);

const accounts = (payload: FakePayload) =>
	(payload.store["ledger-accounts"] ?? []) as unknown as LedgerAccount[];
const transactions = (payload: FakePayload) =>
	(payload.store["ledger-transactions"] ??
		[]) as unknown as LedgerTransaction[];

const balanceOf = (
	payload: FakePayload,
	category: LedgerCategory,
	shop: string | null = SHOP,
) => accountBalance(payload, category, shop, CURRENCY);

let sourceSeq = 0;
function input(
	kind: LedgerTransactionKind,
	entries: readonly LedgerLine[],
	extra: Partial<PostLedgerInput> = {},
): PostLedgerInput {
	sourceSeq += 1;
	return {
		kind,
		entries,
		occurredAt: "2026-10-03T10:00:00.000Z",
		sourceType: "webhook-event",
		sourceId: `evt-${sourceSeq}`,
		currency: CURRENCY,
		shop: SHOP,
		order: "order-1",
		...extra,
	};
}

const post = (payload: FakePayload, posting: PostLedgerInput) =>
	withTransaction(payload, (req) => postLedger(req, posting));

/** A stored posting's entries, keyed back to the account key they hit. */
function storedLines(payload: FakePayload, transaction: LedgerTransaction) {
	const byId = new Map(accounts(payload).map((a) => [String(a.id), a.key]));
	return transaction.entries.map((entry) => ({
		key: byId.get(String(entry.account)),
		debit: entry.debit,
		credit: entry.credit,
	}));
}

const d = (category: LedgerCategory, amount: number): LedgerLine => ({
	category,
	debit: amount,
	credit: 0,
});
const c = (category: LedgerCategory, amount: number): LedgerLine => ({
	category,
	debit: 0,
	credit: amount,
});

const totals = (lines: readonly LedgerLine[]) => ({
	debit: lines.reduce((sum, l) => sum + l.debit, 0),
	credit: lines.reduce((sum, l) => sum + l.credit, 0),
});

const FULL_REFUND = {
	seller: D,
	commission: ORDER.commission,
	commissionVat: ORDER.commissionVat,
	buyerProtectionFee: P,
	buyerProtectionFeeVat: PV,
};

describe("the worked order", () => {
	it("comes out of splitAmounts with the figures the postings below use", () => {
		expect({ G, D, C, P, PV }).toEqual({
			G: 48_410,
			D: 43_240,
			C: 3_760,
			P: 1_410,
			PV: 228,
		});
	});
});

describe("postingFor: the postings table", () => {
	const cases: Array<{
		name: string;
		kind: LedgerTransactionKind;
		lines: LedgerLine[];
		expected: LedgerLine[];
		total: number;
	}> = [
		{
			name: "charge",
			kind: "charge",
			lines: postingFor("charge", ORDER),
			expected: [
				d("provider_position", 48_410),
				c("seller_pending", 43_240),
				c("platform_fee_unearned", 3_760),
				c("platform_revenue_protection_fee", 1_182),
				c("vat_payable", 228),
			],
			total: G,
		},
		{
			name: "provider_fee borne by the platform",
			kind: "provider_fee",
			lines: postingFor("provider_fee", { fee: FEE, bearer: "platform" }),
			expected: [d("provider_fee_expense", FEE), c("provider_position", FEE)],
			total: FEE,
		},
		{
			name: "provider_fee borne by the seller",
			kind: "provider_fee",
			lines: postingFor("provider_fee", { fee: FEE, bearer: "seller" }),
			expected: [d("seller_pending", FEE), c("provider_position", FEE)],
			total: FEE,
		},
		{
			name: "release under provider_hold",
			kind: "release",
			lines: postingFor("release", {
				amount: D,
				releaseModel: "provider_hold",
			}),
			expected: [d("seller_pending", D), c("seller_releasable", D)],
			total: D,
		},
		{
			name: "release under provider_schedule",
			kind: "release",
			lines: postingFor("release", {
				amount: D,
				releaseModel: "provider_schedule",
			}),
			expected: [d("seller_pending", D), c("seller_payout_in_transit", D)],
			total: D,
		},
		{
			name: "commission_earned",
			kind: "commission_earned",
			lines: postingFor("commission_earned", ORDER),
			expected: [
				d("platform_fee_unearned", 3_760),
				c("platform_revenue_commission", 3_153),
				c("vat_payable", 607),
			],
			total: C,
		},
		{
			name: "payout_submitted",
			kind: "payout_submitted",
			lines: postingFor("payout_submitted", { amount: D }),
			expected: [d("seller_releasable", D), c("seller_payout_in_transit", D)],
			total: D,
		},
		{
			name: "payout_complete",
			kind: "payout_complete",
			lines: postingFor("payout_complete", { amount: D }),
			expected: [d("seller_payout_in_transit", D), c("provider_position", D)],
			total: D,
		},
		{
			name: "payout_failed",
			kind: "payout_failed",
			lines: postingFor("payout_failed", { amount: D }),
			expected: [d("seller_payout_in_transit", D), c("seller_releasable", D)],
			total: D,
		},
		{
			name: "payout_reversed under provider_hold",
			kind: "payout_reversed",
			lines: postingFor("payout_reversed", {
				amount: D,
				releaseModel: "provider_hold",
			}),
			expected: [d("provider_position", D), c("seller_releasable", D)],
			total: D,
		},
		{
			name: "payout_reversed under provider_schedule",
			kind: "payout_reversed",
			lines: postingFor("payout_reversed", {
				amount: D,
				releaseModel: "provider_schedule",
			}),
			expected: [d("provider_position", D), c("seller_payout_in_transit", D)],
			total: D,
		},
		{
			name: "refund_submitted, full, before commission_earned",
			kind: "refund_submitted",
			lines: postingFor("refund_submitted", {
				...FULL_REFUND,
				sellerPendingAvailable: D,
				commissionEarned: false,
			}),
			expected: [
				d("seller_pending", 43_240),
				d("platform_fee_unearned", 3_760),
				d("platform_revenue_protection_fee", 1_182),
				d("vat_payable", 228),
				c("buyer_refund_in_transit", 48_410),
			],
			total: G,
		},
		{
			name: "refund_submitted, full, after commission_earned",
			kind: "refund_submitted",
			lines: postingFor("refund_submitted", {
				...FULL_REFUND,
				sellerPendingAvailable: D,
				commissionEarned: true,
			}),
			expected: [
				d("seller_pending", 43_240),
				d("platform_revenue_commission", 3_153),
				d("vat_payable", 835),
				d("platform_revenue_protection_fee", 1_182),
				c("buyer_refund_in_transit", 48_410),
			],
			total: G,
		},
		{
			name: "refund_submitted with pending short by 3,240",
			kind: "refund_submitted",
			lines: postingFor("refund_submitted", {
				...FULL_REFUND,
				sellerPendingAvailable: 40_000,
				commissionEarned: false,
			}),
			expected: [
				d("seller_pending", 40_000),
				d("seller_receivable", 3_240),
				d("platform_fee_unearned", 3_760),
				d("platform_revenue_protection_fee", 1_182),
				d("vat_payable", 228),
				c("buyer_refund_in_transit", 48_410),
			],
			total: G,
		},
		{
			name: "refund_submitted, partial, never touching the fee",
			kind: "refund_submitted",
			lines: postingFor("refund_submitted", {
				seller: 10_000,
				commission: 0,
				commissionVat: 0,
				buyerProtectionFee: 0,
				buyerProtectionFeeVat: 0,
				sellerPendingAvailable: D,
				commissionEarned: false,
			}),
			expected: [
				d("seller_pending", 10_000),
				c("buyer_refund_in_transit", 10_000),
			],
			total: 10_000,
		},
		{
			name: "refund_complete",
			kind: "refund_complete",
			lines: postingFor("refund_complete", { amount: G }),
			expected: [d("buyer_refund_in_transit", G), c("provider_position", G)],
			total: G,
		},
		{
			name: "refund_failed reverses refund_submitted line for line",
			kind: "refund_failed",
			lines: postingFor("refund_failed", {
				submitted: postingFor("refund_submitted", {
					...FULL_REFUND,
					sellerPendingAvailable: 40_000,
					commissionEarned: false,
				}),
			}),
			expected: [
				c("seller_pending", 40_000),
				c("seller_receivable", 3_240),
				c("platform_fee_unearned", 3_760),
				c("platform_revenue_protection_fee", 1_182),
				c("vat_payable", 228),
				d("buyer_refund_in_transit", 48_410),
			],
			total: G,
		},
		{
			name: "clawback_recovered from pending",
			kind: "clawback_recovered",
			lines: postingFor("clawback_recovered", {
				amount: 3_240,
				from: "seller_pending",
			}),
			expected: [d("seller_pending", 3_240), c("seller_receivable", 3_240)],
			total: 3_240,
		},
		{
			name: "clawback_recovered from releasable",
			kind: "clawback_recovered",
			lines: postingFor("clawback_recovered", {
				amount: 3_240,
				from: "seller_releasable",
			}),
			expected: [d("seller_releasable", 3_240), c("seller_receivable", 3_240)],
			total: 3_240,
		},
		{
			name: "guarantee_writeoff",
			kind: "guarantee_writeoff",
			lines: postingFor("guarantee_writeoff", { amount: 3_240 }),
			expected: [
				d("buyer_guarantee_expense", 3_240),
				c("seller_receivable", 3_240),
			],
			total: 3_240,
		},
		{
			name: "netting_reversed",
			kind: "netting_reversed",
			lines: postingFor("netting_reversed", {
				netting: postingFor("clawback_recovered", {
					amount: 3_240,
					from: "seller_releasable",
				}),
			}),
			expected: [c("seller_releasable", 3_240), d("seller_receivable", 3_240)],
			total: 3_240,
		},
	];

	it("covers every posting kind", () => {
		expect(new Set(cases.map((x) => x.kind))).toEqual(
			new Set(LEDGER_TRANSACTION_KINDS),
		);
	});

	it.each(cases)("$name: exact entries, balanced", ({
		lines,
		expected,
		total,
	}) => {
		expect(lines).toEqual(expected);
		expect(totals(lines)).toEqual({ debit: total, credit: total });
	});

	it.each(
		cases,
	)("$name: postLedger stores exactly those entries on the keyed accounts", async ({
		kind,
		expected,
	}) => {
		const payload = ledger();
		const { transaction, created } = await post(payload, input(kind, expected));
		expect(created).toBe(true);
		expect(storedLines(payload, transaction)).toEqual(
			expected.map((line) => ({
				key: ledgerAccountKey(line.category, SHOP, CURRENCY),
				debit: line.debit,
				credit: line.credit,
			})),
		);
	});
});

describe("account keys", () => {
	it("scopes the seller categories to the shop and every other one to the platform", () => {
		expect(ledgerAccountKey("seller_pending", "shop-9", "XAF")).toBe(
			"seller_pending:shop-9:XAF",
		);
		expect(ledgerAccountKey("vat_payable", "shop-9", "XAF")).toBe(
			"vat_payable:platform:XAF",
		);
	});

	it("creates each account once, typed from the chart, and $incs it on its normal side", async () => {
		const payload = ledger();
		await post(payload, input("charge", postingFor("charge", ORDER)));
		await post(
			payload,
			input("commission_earned", postingFor("commission_earned", ORDER)),
		);
		expect(
			accounts(payload)
				.map((a) => ({
					key: a.key,
					type: a.type,
					shop: a.shop ?? null,
					balance: a.balance,
				}))
				.sort((a, b) => a.key.localeCompare(b.key)),
		).toEqual([
			{
				key: "platform_fee_unearned:platform:XAF",
				type: "liability",
				shop: null,
				balance: 0,
			},
			{
				key: "platform_revenue_commission:platform:XAF",
				type: "revenue",
				shop: null,
				balance: 3_153,
			},
			{
				key: "platform_revenue_protection_fee:platform:XAF",
				type: "revenue",
				shop: null,
				balance: 1_182,
			},
			{
				key: "provider_position:platform:XAF",
				type: "asset",
				shop: null,
				balance: 48_410,
			},
			{
				key: "seller_pending:shop-1:XAF",
				type: "liability",
				shop: SHOP,
				balance: 43_240,
			},
			{
				key: "vat_payable:platform:XAF",
				type: "liability",
				shop: null,
				balance: 835,
			},
		]);
	});
});

describe("idempotency", () => {
	it("a duplicate key returns the first transaction and moves the balance once", async () => {
		const payload = ledger();
		const posting = input("charge", postingFor("charge", ORDER), {
			sourceId: "evt-charge",
		});
		const first = await post(payload, posting);
		const second = await post(payload, posting);

		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(second.transaction.id).toBe(first.transaction.id);
		expect(first.transaction.idempotencyKey).toBe(
			"webhook-event:evt-charge:charge",
		);
		expect(transactions(payload)).toHaveLength(1);
		expect(await balanceOf(payload, "seller_pending")).toBe(43_240);
		expect(await balanceOf(payload, "provider_position", null)).toBe(48_410);
	});

	it("the same source under another kind is a separate posting", async () => {
		const payload = ledger();
		await post(
			payload,
			input("charge", postingFor("charge", ORDER), { sourceId: "evt-x" }),
		);
		await post(
			payload,
			input(
				"provider_fee",
				postingFor("provider_fee", { fee: FEE, bearer: "platform" }),
				{ sourceId: "evt-x" },
			),
		);
		expect(transactions(payload).map((t) => t.idempotencyKey)).toEqual([
			"webhook-event:evt-x:charge",
			"webhook-event:evt-x:provider_fee",
		]);
	});
});

describe("refusals before any write", () => {
	it("an unbalanced posting is refused with nothing written", async () => {
		const payload = ledger();
		await expect(
			post(
				payload,
				input("charge", [d("provider_position", 100), c("seller_pending", 90)]),
			),
		).rejects.toThrow("[ledger] Unbalanced posting: debits 100, credits 90.");
		expect(payload.writes).toEqual([]);

		await post(
			payload,
			input("charge", [d("provider_position", 100), c("seller_pending", 100)]),
		);
		expect(payload.writes.map((w) => `${w.op}:${w.collection}`)).toEqual([
			"create:ledger-accounts",
			"create:ledger-accounts",
			"create:ledger-transactions",
			"db.updateOne:ledger-accounts",
			"db.updateOne:ledger-accounts",
		]);
	});

	it("a fractional or negative amount is refused with nothing written", async () => {
		const payload = ledger();
		await expect(
			post(
				payload,
				input("charge", [
					d("provider_position", 10.5),
					c("seller_pending", 10.5),
				]),
			),
		).rejects.toThrow("Entry 0 is not a whole amount of zero or more.");
		await expect(
			post(
				payload,
				input("charge", [d("provider_position", -5), c("seller_pending", -5)]),
			),
		).rejects.toThrow("Entry 0 is not a whole amount of zero or more.");
		expect(payload.writes).toEqual([]);
	});

	it("a seller line without the posting's shop is refused with nothing written", async () => {
		const payload = ledger();
		await expect(
			post(
				payload,
				input("charge", postingFor("charge", ORDER), { shop: undefined }),
			),
		).rejects.toThrow("[ledger] A seller account needs the posting's shop.");
		expect(payload.writes).toEqual([]);
	});
});

describe("one transaction with the caller", () => {
	it("a failing balance $inc rolls the posting back with it", async () => {
		const payload = ledger();
		let incs = 0;
		payload.failWhen = (method, args) =>
			method === "db.updateOne" &&
			args.collection === "ledger-accounts" &&
			++incs === 3;

		await expect(
			post(payload, input("charge", postingFor("charge", ORDER))),
		).rejects.toThrow("forced failure: db.updateOne");

		expect(incs).toBe(3);
		expect(transactions(payload)).toEqual([]);
		expect(accounts(payload)).toEqual([]);
	});

	it("a caller failing after the posting rolls back the posting and every balance", async () => {
		const payload = ledger();
		await post(payload, input("charge", postingFor("charge", ORDER)));

		await expect(
			withTransaction(payload, async (req) => {
				await postLedger(
					req,
					input("commission_earned", postingFor("commission_earned", ORDER)),
				);
				expect(
					await accountBalance(
						payload,
						"platform_revenue_commission",
						null,
						CURRENCY,
						req,
					),
				).toBe(3_153);
				throw new Error("the order transition failed");
			}),
		).rejects.toThrow("the order transition failed");

		expect(transactions(payload).map((t) => t.kind)).toEqual(["charge"]);
		expect(await balanceOf(payload, "platform_fee_unearned", null)).toBe(3_760);
		expect(await balanceOf(payload, "platform_revenue_commission", null)).toBe(
			0,
		);
		expect(await balanceOf(payload, "vat_payable", null)).toBe(228);
	});
});

describe("refund_submitted before and after commission_earned", () => {
	const refundOf = async (
		req: PayloadRequest,
		commissionEarned: boolean,
	): Promise<LedgerLine[]> => {
		const position = await orderBalances(req, "order-1");
		return postingFor("refund_submitted", {
			...FULL_REFUND,
			sellerPendingAvailable: position.seller_pending ?? 0,
			commissionEarned,
		});
	};

	it("before: the commission comes back out of platform_fee_unearned", async () => {
		const payload = ledger();
		await post(payload, input("charge", postingFor("charge", ORDER)));
		const { transaction } = await withTransaction(payload, async (req) =>
			postLedger(req, input("refund_submitted", await refundOf(req, false))),
		);

		expect(storedLines(payload, transaction)).toEqual([
			{ key: "seller_pending:shop-1:XAF", debit: 43_240, credit: 0 },
			{ key: "platform_fee_unearned:platform:XAF", debit: 3_760, credit: 0 },
			{
				key: "platform_revenue_protection_fee:platform:XAF",
				debit: 1_182,
				credit: 0,
			},
			{ key: "vat_payable:platform:XAF", debit: 228, credit: 0 },
			{ key: "buyer_refund_in_transit:platform:XAF", debit: 0, credit: 48_410 },
		]);
		expect(await balanceOf(payload, "platform_fee_unearned", null)).toBe(0);
		expect(await balanceOf(payload, "platform_revenue_commission", null)).toBe(
			0,
		);
	});

	it("after: it comes out of platform_revenue_commission and vat_payable, the released seller part as a receivable", async () => {
		const payload = ledger();
		await post(payload, input("charge", postingFor("charge", ORDER)));
		await post(
			payload,
			input(
				"release",
				postingFor("release", { amount: D, releaseModel: "provider_hold" }),
			),
		);
		await post(
			payload,
			input("commission_earned", postingFor("commission_earned", ORDER)),
		);
		const { transaction } = await withTransaction(payload, async (req) =>
			postLedger(req, input("refund_submitted", await refundOf(req, true))),
		);

		expect(storedLines(payload, transaction)).toEqual([
			{ key: "seller_receivable:shop-1:XAF", debit: 43_240, credit: 0 },
			{
				key: "platform_revenue_commission:platform:XAF",
				debit: 3_153,
				credit: 0,
			},
			{ key: "vat_payable:platform:XAF", debit: 835, credit: 0 },
			{
				key: "platform_revenue_protection_fee:platform:XAF",
				debit: 1_182,
				credit: 0,
			},
			{ key: "buyer_refund_in_transit:platform:XAF", debit: 0, credit: 48_410 },
		]);
		expect(await balanceOf(payload, "platform_revenue_commission", null)).toBe(
			0,
		);
		expect(await balanceOf(payload, "seller_pending")).toBe(0);
		expect(await balanceOf(payload, "seller_receivable")).toBe(43_240);
	});
});

/** Σ(asset + expense) − Σ(liability + revenue): zero for a balanced ledger. */
function signedSum(payload: FakePayload): number {
	return accounts(payload).reduce(
		(sum, a) =>
			["asset", "expense"].includes(LEDGER_CATEGORY_TYPES[a.category])
				? sum + a.balance
				: sum - a.balance,
		0,
	);
}

describe("property: 200 legal events", () => {
	interface OrderModel {
		id: string;
		shop: string;
		amounts: ReturnType<typeof split>;
		feePosted: boolean;
		released: boolean;
		earned: boolean;
		refundedSeller: number;
		refundedCommission: number;
		refundedCommissionVat: number;
		feeRefunded: boolean;
	}
	interface RefundModel {
		order: OrderModel;
		transaction: LedgerTransaction;
		lines: LedgerLine[];
		total: number;
		breakdown: {
			seller: number;
			commission: number;
			commissionVat: number;
			fee: boolean;
		};
		open: boolean;
	}
	interface PayoutModel {
		shop: string;
		amount: number;
		open: boolean;
		releaseModel: ReleaseModel;
	}

	it("keeps the signed sum at zero, seller_pending non-negative, and every cache equal to its recomputation", async () => {
		let state = 0x2026_1003;
		const next = () => {
			state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
			return state / 0x7fffffff;
		};
		const int = (lo: number, hi: number) =>
			lo + Math.floor(next() * (hi - lo + 1));
		const pick = <T>(items: T[]): T => items[Math.floor(next() * items.length)];

		const payload = ledger();
		const shops: Record<string, ReleaseModel> = {
			"shop-a": "provider_hold",
			"shop-b": "provider_hold",
			"shop-c": "provider_schedule",
		};
		const orders: OrderModel[] = [];
		const refunds: RefundModel[] = [];
		const payouts: PayoutModel[] = [];
		const posted: Partial<Record<LedgerTransactionKind, number>> = {};
		let shortfalls = 0;
		let seq = 0;

		const bal = (category: LedgerCategory, shop: string | null) =>
			accountBalance(payload, category, shop, CURRENCY);
		const send = async (
			kind: LedgerTransactionKind,
			shop: string,
			order: string | undefined,
			build: (req: PayloadRequest) => Promise<LedgerLine[]>,
			extra: Partial<PostLedgerInput> = {},
		) => {
			seq += 1;
			const { transaction } = await withTransaction(payload, async (req) =>
				postLedger(req, {
					kind,
					entries: await build(req),
					occurredAt: new Date(Date.UTC(2026, 9, 3, 0, seq)).toISOString(),
					sourceType: "webhook-event",
					sourceId: `prop-${seq}`,
					currency: CURRENCY,
					shop,
					...(order ? { order } : {}),
					...extra,
				}),
			);
			posted[kind] = (posted[kind] ?? 0) + 1;
			return transaction;
		};

		type Step = () => Promise<void>;
		const legalSteps = async (): Promise<Step[]> => {
			const steps: Step[] = [];
			const pendingOf = new Map<string, number>();
			for (const o of orders.filter((x) => !x.released)) {
				const position = await withTransaction(payload, (req) =>
					orderBalances(req, o.id),
				);
				pendingOf.set(o.id, position.seller_pending ?? 0);
			}
			steps.push(async () => {
				const orderTotal = int(1_000, 400_000);
				const model: OrderModel = {
					id: `order-${orders.length + 1}`,
					shop: pick(Object.keys(shops)),
					amounts: split(orderTotal, Math.floor(orderTotal * 0.067)),
					feePosted: false,
					released: false,
					earned: false,
					refundedSeller: 0,
					refundedCommission: 0,
					refundedCommissionVat: 0,
					feeRefunded: false,
				};
				orders.push(model);
				await send("charge", model.shop, model.id, async () =>
					postingFor("charge", model.amounts),
				);
			});

			for (const o of orders.filter((x) => !x.feePosted && !x.released)) {
				steps.push(async () => {
					o.feePosted = true;
					await send("provider_fee", o.shop, o.id, async (req) => {
						const pending =
							(await orderBalances(req, o.id)).seller_pending ?? 0;
						const fee = Math.min(
							Math.round(o.amounts.buyerTotal * 0.025),
							pending,
						);
						return postingFor("provider_fee", {
							fee: Math.max(fee, 1),
							bearer: pending > 0 && next() < 0.5 ? "seller" : "platform",
						});
					});
				});
			}

			for (const o of orders.filter(
				(x) => !x.released && (pendingOf.get(x.id) ?? 0) > 0,
			)) {
				steps.push(async () => {
					o.released = true;
					const t = await send("release", o.shop, o.id, async (req) =>
						postingFor("release", {
							amount: Math.max(
								(await orderBalances(req, o.id)).seller_pending ?? 0,
								0,
							),
							releaseModel: shops[o.shop],
						}),
					);
					const amount = t.entries[0]?.debit ?? 0;
					if (shops[o.shop] === "provider_schedule" && amount > 0) {
						payouts.push({
							shop: o.shop,
							amount,
							open: true,
							releaseModel: "provider_schedule",
						});
					}
				});
			}

			for (const o of orders.filter((x) => x.released && !x.earned)) {
				const commission = o.amounts.commission - o.refundedCommission;
				const commissionVat = o.amounts.commissionVat - o.refundedCommissionVat;
				if (commission + commissionVat === 0) continue;
				steps.push(async () => {
					o.earned = true;
					await send("commission_earned", o.shop, o.id, async (req) => {
						const unearned =
							(await orderBalances(req, o.id)).platform_fee_unearned ?? 0;
						expect(unearned).toBe(commission + commissionVat);
						return postingFor("commission_earned", {
							commission,
							commissionVat,
						});
					});
				});
			}

			for (const o of orders) {
				const sellerLeft = o.amounts.destinationAmount - o.refundedSeller;
				if (sellerLeft <= 0) continue;
				steps.push(async () => {
					const full = next() < 0.4;
					const breakdown = full
						? {
								seller: sellerLeft,
								commission: o.amounts.commission - o.refundedCommission,
								commissionVat:
									o.amounts.commissionVat - o.refundedCommissionVat,
								fee: !o.feeRefunded,
							}
						: {
								seller: int(1, sellerLeft),
								commission: 0,
								commissionVat: 0,
								fee: false,
							};
					o.refundedSeller += breakdown.seller;
					o.refundedCommission += breakdown.commission;
					o.refundedCommissionVat += breakdown.commissionVat;
					if (breakdown.fee) o.feeRefunded = true;
					let available = 0;
					const transaction = await send(
						"refund_submitted",
						o.shop,
						o.id,
						async (req) => {
							available = Math.max(
								(await orderBalances(req, o.id)).seller_pending ?? 0,
								0,
							);
							return postingFor("refund_submitted", {
								seller: breakdown.seller,
								commission: breakdown.commission,
								commissionVat: breakdown.commissionVat,
								buyerProtectionFee: breakdown.fee
									? o.amounts.buyerProtectionFee
									: 0,
								buyerProtectionFeeVat: breakdown.fee
									? o.amounts.buyerProtectionFeeVat
									: 0,
								sellerPendingAvailable: available,
								commissionEarned: o.earned,
							});
						},
					);
					const lines = await withTransaction(payload, (req) =>
						transactionLines(req, transaction),
					);
					const receivable = lines.find(
						(l) => l.category === "seller_receivable",
					);
					if (breakdown.seller > available) {
						shortfalls += 1;
						expect(receivable?.debit).toBe(breakdown.seller - available);
					} else {
						expect(receivable).toBeUndefined();
					}
					refunds.push({
						order: o,
						transaction,
						lines,
						total: totals(lines).credit,
						breakdown,
						open: true,
					});
				});
			}

			for (const r of refunds.filter((x) => x.open)) {
				steps.push(async () => {
					r.open = false;
					await send("refund_complete", r.order.shop, r.order.id, async () =>
						postingFor("refund_complete", { amount: r.total }),
					);
				});
				const { lines } = r;
				const owed =
					lines.find((l) => l.category === "seller_receivable")?.debit ?? 0;
				if (owed > (await bal("seller_receivable", r.order.shop))) continue;
				steps.push(async () => {
					r.open = false;
					const o = r.order;
					o.refundedSeller -= r.breakdown.seller;
					o.refundedCommission -= r.breakdown.commission;
					o.refundedCommissionVat -= r.breakdown.commissionVat;
					if (r.breakdown.fee) o.feeRefunded = false;
					await send(
						"refund_failed",
						o.shop,
						o.id,
						async () => postingFor("refund_failed", { submitted: lines }),
						{ reverses: r.transaction.id },
					);
				});
			}

			for (const shop of Object.keys(shops)) {
				const releasable = await bal("seller_releasable", shop);
				if (releasable > 0) {
					steps.push(async () => {
						const amount = int(1, releasable);
						payouts.push({
							shop,
							amount,
							open: true,
							releaseModel: "provider_hold",
						});
						await send("payout_submitted", shop, undefined, async () =>
							postingFor("payout_submitted", { amount }),
						);
					});
				}
				const receivable = await bal("seller_receivable", shop);
				if (receivable > 0) {
					steps.push(async () => {
						await send("guarantee_writeoff", shop, undefined, async () =>
							postingFor("guarantee_writeoff", { amount: receivable }),
						);
					});
					if (releasable > 0) {
						steps.push(async () => {
							const amount = Math.min(receivable, releasable);
							await send("clawback_recovered", shop, undefined, async () =>
								postingFor("clawback_recovered", {
									amount,
									from: "seller_releasable",
								}),
							);
						});
					}
					for (const o of orders.filter(
						(x) =>
							x.shop === shop && !x.released && (pendingOf.get(x.id) ?? 0) >= 2,
					)) {
						steps.push(async () => {
							await send("clawback_recovered", shop, o.id, async (req) => {
								const pending =
									(await orderBalances(req, o.id)).seller_pending ?? 0;
								const amount = Math.min(receivable, Math.floor(pending / 2));
								return postingFor("clawback_recovered", {
									amount: Math.max(amount, 0),
									from: "seller_pending",
								});
							});
						});
					}
				}
			}

			const reversed = new Set(
				transactions(payload)
					.filter((transaction) => transaction.kind === "netting_reversed")
					.map((transaction) => String(transaction.reverses)),
			);
			for (const netting of transactions(payload).filter(
				(transaction) =>
					transaction.kind === "clawback_recovered" &&
					!reversed.has(String(transaction.id)),
			)) {
				const shop = String(netting.shop);
				if (!Object.hasOwn(shops, shop)) continue;
				const nettingLines = await withTransaction(payload, (req) =>
					transactionLines(req, netting),
				);
				const amount = nettingLines
					.filter((line) => line.category === "seller_receivable")
					.reduce((sum, line) => sum + line.credit - line.debit, 0);
				if (amount <= 0 || (await bal("seller_receivable", shop)) < amount)
					continue;
				steps.push(async () => {
					await send(
						"netting_reversed",
						shop,
						String(netting.order ?? "") || undefined,
						async () =>
							postingFor("netting_reversed", { netting: nettingLines }),
						{ reverses: String(netting.id) },
					);
				});
			}

			for (const p of payouts.filter((x) => x.open)) {
				for (const kind of [
					"payout_complete",
					"payout_failed",
					"payout_reversed",
				] as const) {
					steps.push(async () => {
						p.open = false;
						await send(kind, p.shop, undefined, async () =>
							postingFor(kind, {
								amount: p.amount,
								releaseModel: p.releaseModel,
							}),
						);
					});
				}
			}
			return steps;
		};

		const EVENTS = 200;
		for (let event = 0; event < EVENTS; event++) {
			const steps = await legalSteps();
			// Lean on charges early so later events have orders to act on.
			const step = event < 10 || next() < 0.12 ? steps[0] : pick(steps);
			await step();

			expect(signedSum(payload)).toBe(0);
			for (const a of accounts(payload)) {
				if (a.category === "seller_pending")
					expect(a.balance).toBeGreaterThanOrEqual(0);
			}
		}

		expect(transactions(payload)).toHaveLength(EVENTS);
		expect(Object.keys(posted).sort()).toEqual(
			[...LEDGER_TRANSACTION_KINDS].sort(),
		);
		expect(shortfalls).toBeGreaterThan(0);

		const recomputed = await recomputeBalances(payload);
		const cached = new Map(
			accounts(payload).map((a) => [String(a.id), a.balance]),
		);
		expect(cached.size).toBeGreaterThan(12);
		expect(recomputed).toEqual(cached);
	}, 30_000);
});

describe("recomputeBalances", () => {
	it("reads the entries, not the cache: a corrupted cache shows up against it", async () => {
		const payload = ledger();
		await post(payload, input("charge", postingFor("charge", ORDER)));
		await post(
			payload,
			input(
				"provider_fee",
				postingFor("provider_fee", { fee: FEE, bearer: "seller" }),
			),
		);
		const pending = accounts(payload).find(
			(a) => a.key === "seller_pending:shop-1:XAF",
		);
		if (!pending) throw new Error("no seller_pending account");
		pending.balance += 1;

		const recomputed = await recomputeBalances(payload);
		expect(recomputed.get(String(pending.id))).toBe(42_030);
		expect(pending.balance).toBe(42_031);
	});
});
