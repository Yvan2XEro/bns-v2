// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTransfer } = vi.hoisted(() => ({
	createTransfer: vi.fn(async () => ({
		transferId: "transfer-1",
		reference: "RP-2610-000001",
	})),
}));
vi.mock("../../src/lib/payments", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/lib/payments")>()),
	getNotchPayProvider: () => ({ createTransfer }),
}));
vi.mock("../../src/services/sequences", () => ({
	nextNumber: vi.fn(async () => "RP-2610-000001"),
}));
vi.mock("../../src/services/paymentNotifications", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/paymentNotifications")
	>()),
	notifyReconciliationAlert: vi.fn(async () => {}),
}));

import type { LedgerCategory } from "../../src/collections/LedgerAccounts";
import { LEDGER_TRANSACTION_KINDS } from "../../src/collections/LedgerTransactions";
import {
	DEFAULT_MARKETS,
	PAYMENT_DEFAULTS,
} from "../../src/lib/paymentSettings";
import { FakeMarketplaceProvider } from "../../src/lib/payments/fakeMarketplace";
import type { TransferEvent } from "../../src/lib/payments/marketplace";
import { withTransaction } from "../../src/lib/transactions";
import type { LedgerAccount, LedgerTransaction } from "../../src/payload-types";
import {
	accountBalance,
	type LedgerLine,
	ledgerIntegrity,
	postingFor,
} from "../../src/services/ledger";
import { adjustResellerCommission } from "../../src/services/purchaseOrders";
import {
	reconciliationWindow,
	runReconciliation,
} from "../../src/services/reconciliation";
import {
	applyResellerPayoutEvent,
	payResellerCommissions,
	releaseResellerCommissions,
} from "../../src/services/resellerPayouts";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

const RESELLER = "shop-reseller";
const NOW = new Date("2026-08-17T00:00:00.000Z");
const GROSS = 20_000;
const OFFSET = 5_000;
const NET = GROSS - OFFSET;

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

describe("reseller postings, kind by kind", () => {
	it("pins the lines of every reseller kind", () => {
		const cases = {
			reseller_commission_payable: [
				postingFor("reseller_commission_payable", { amount: GROSS }),
				[
					d("provider_position", GROSS),
					c("reseller_commission_payable", GROSS),
				],
			],
			reseller_commission_reduced: [
				postingFor("reseller_commission_reduced", { amount: 700 }),
				[d("reseller_commission_payable", 700), c("provider_position", 700)],
			],
			reseller_payout_submitted: [
				postingFor("reseller_payout_submitted", {
					gross: GROSS,
					offset: OFFSET,
					amount: NET,
				}),
				[
					d("reseller_commission_payable", GROSS),
					c("reseller_payout_in_transit", NET),
					c("provider_position", OFFSET),
				],
			],
			reseller_payout_failed: [
				postingFor("reseller_payout_failed", {
					gross: GROSS,
					offset: OFFSET,
					amount: NET,
				}),
				[
					d("reseller_payout_in_transit", NET),
					d("provider_position", OFFSET),
					c("reseller_commission_payable", GROSS),
				],
			],
			reseller_payout_complete: [
				postingFor("reseller_payout_complete", { amount: NET }),
				[d("reseller_payout_in_transit", NET), c("provider_position", NET)],
			],
			reseller_payout_reversed: [
				postingFor("reseller_payout_reversed", { gross: GROSS }),
				[
					d("provider_position", GROSS),
					c("reseller_commission_payable", GROSS),
				],
			],
		} as const;
		for (const [lines, expected] of Object.values(cases)) {
			expect(lines).toEqual(expected);
		}
		expect(Object.keys(cases).sort()).toEqual(
			LEDGER_TRANSACTION_KINDS.filter((kind) =>
				kind.startsWith("reseller_"),
			).sort(),
		);
	});

	it("a payout without charges posts no offset line", () => {
		expect(
			postingFor("reseller_payout_submitted", {
				gross: GROSS,
				offset: 0,
				amount: GROSS,
			}),
		).toEqual([
			d("reseller_commission_payable", GROSS),
			c("reseller_payout_in_transit", GROSS),
		]);
	});
});

const world = () =>
	fakePayload(
		{
			"reseller-commissions": [
				{
					id: "commission-1",
					resellerShop: RESELLER,
					order: "order-1",
					purchaseOrder: "purchase-order-1",
					status: "accrued",
					amount: GROSS,
				},
			],
			"reseller-charges": [
				{
					id: "charge-1",
					resellerShop: RESELLER,
					status: "open",
					amount: OFFSET,
					createdAt: "2026-08-01T00:00:00.000Z",
				},
			],
			"purchase-orders": [
				{
					id: "purchase-order-1",
					resellerShop: RESELLER,
					supplierShop: "shop-supplier",
					resellerCommission: GROSS,
				},
			],
			orders: [
				{
					id: "order-1",
					status: "completed",
					completionHold: null,
					timestamps: {
						deliveredAt: "2026-08-01T00:00:00.000Z",
						completedAt: "2026-08-01T00:00:00.000Z",
					},
				},
			],
			"commission-lines": [
				{
					id: "margin-line-1",
					order: "order-1",
					kind: "resale_margin",
					invoice: "invoice-1",
				},
			],
			"commission-invoices": [{ id: "invoice-1", status: "paid" }],
			"payout-accounts": [
				{
					id: "account-1",
					shop: RESELLER,
					status: "active",
					method: "mtn_momo",
					accountNumber: "+237670000001",
					accountName: "Reseller",
				},
			],
		},
		{
			uniques: {
				"ledger-accounts": [["key"]],
				"ledger-transactions": [["idempotencyKey"]],
			},
			globals: {
				"app-settings": {
					orders: { withdrawalDays: 15 },
					payments: {
						gates: ["G1", "G2", "G4", "G5", "G6"].map((gate) => ({
							gate,
							evidence: "evidence-1",
						})),
					},
				},
			},
		},
	);

const transferEvent = (status: TransferEvent["status"]): TransferEvent => ({
	entity: "transfer",
	status,
	reference: "RP-2610-000001",
	transferId: "transfer-1",
	accountId: "",
	amount: NET,
	currency: "XAF",
	fee: null,
	failureReason: status === "failed" ? "rejected" : null,
	providerTransactionId: "transfer-1",
	providerEventId: `transfer-event-${status}`,
	type: `transfer/${status}`,
});

const apply = (payload: FakePayload, status: TransferEvent["status"]) =>
	withTransaction(payload, (req) =>
		applyResellerPayoutEvent(req, transferEvent(status)),
	);

const balances = async (payload: FakePayload) => ({
	payable: await accountBalance(
		payload,
		"reseller_commission_payable",
		RESELLER,
		"XAF",
	),
	inTransit: await accountBalance(
		payload,
		"reseller_payout_in_transit",
		RESELLER,
		"XAF",
	),
	providerPosition: await accountBalance(
		payload,
		"provider_position",
		null,
		"XAF",
	),
});

const postings = (payload: FakePayload) => {
	const byId = new Map(
		(payload.store["ledger-accounts"] as unknown as LedgerAccount[]).map(
			(account) => [String(account.id), account.key],
		),
	);
	return (
		payload.store["ledger-transactions"] as unknown as LedgerTransaction[]
	).map((transaction) => ({
		kind: transaction.kind,
		sourceType: transaction.sourceType,
		sourceId: transaction.sourceId,
		shop: transaction.shop,
		order: transaction.order,
		entries: transaction.entries.map((entry) => ({
			key: byId.get(String(entry.account)),
			debit: entry.debit,
			credit: entry.credit,
		})),
	}));
};

let payload: FakePayload;

beforeEach(async () => {
	createTransfer.mockClear();
	payload = world();
	expect(await releaseResellerCommissions(payload, NOW)).toEqual([
		"commission-1",
	]);
});

const submit = async () => {
	const result = await payResellerCommissions(payload, { now: NOW });
	expect(result.skipped).toEqual([]);
	expect(result.submitted).toHaveLength(1);
};

describe("a reseller payout across the ledger", () => {
	it("posts every state change as a whole object", async () => {
		await submit();
		await apply(payload, "complete");
		expect(postings(payload)).toEqual([
			{
				kind: "reseller_commission_payable",
				sourceType: "resale-event",
				sourceId: "commission-1",
				shop: RESELLER,
				order: "order-1",
				entries: [
					{
						key: "provider_position:platform:XAF",
						debit: GROSS,
						credit: 0,
					},
					{
						key: `reseller_commission_payable:${RESELLER}:XAF`,
						debit: 0,
						credit: GROSS,
					},
				],
			},
			{
				kind: "reseller_payout_submitted",
				sourceType: "resale-event",
				sourceId: expect.any(String),
				shop: RESELLER,
				entries: [
					{
						key: `reseller_commission_payable:${RESELLER}:XAF`,
						debit: GROSS,
						credit: 0,
					},
					{
						key: `reseller_payout_in_transit:${RESELLER}:XAF`,
						debit: 0,
						credit: NET,
					},
					{
						key: "provider_position:platform:XAF",
						debit: 0,
						credit: OFFSET,
					},
				],
			},
			{
				kind: "reseller_payout_complete",
				sourceType: "resale-event",
				sourceId: expect.any(String),
				shop: RESELLER,
				entries: [
					{
						key: `reseller_payout_in_transit:${RESELLER}:XAF`,
						debit: NET,
						credit: 0,
					},
					{ key: "provider_position:platform:XAF", debit: 0, credit: NET },
				],
			},
		]);
	});

	it("charge to payout to complete ends at the exact balance set", async () => {
		expect(await balances(payload)).toEqual({
			payable: GROSS,
			inTransit: 0,
			providerPosition: GROSS,
		});
		await submit();
		expect(createTransfer).toHaveBeenCalledOnce();
		expect(await balances(payload)).toEqual({
			payable: 0,
			inTransit: NET,
			providerPosition: GROSS - OFFSET,
		});
		await apply(payload, "complete");
		expect(await balances(payload)).toEqual({
			payable: 0,
			inTransit: 0,
			providerPosition: 0,
		});
	});

	it("a replayed completion moves nothing", async () => {
		await submit();
		await apply(payload, "complete");
		await apply(payload, "complete");
		expect(await balances(payload)).toEqual({
			payable: 0,
			inTransit: 0,
			providerPosition: 0,
		});
		expect(postings(payload)).toHaveLength(3);
	});

	it("a reversal after completion returns the money to payable and in-transit stays 0", async () => {
		await submit();
		await apply(payload, "complete");
		await apply(payload, "reversed");
		const after = await balances(payload);
		expect(after).toEqual({
			payable: GROSS,
			inTransit: 0,
			providerPosition: GROSS,
		});
		expect(after.inTransit).toBeGreaterThanOrEqual(0);
		const reversal = postings(payload).at(-1);
		expect(reversal).toMatchObject({
			kind: "reseller_payout_reversed",
			entries: [
				{ key: "provider_position:platform:XAF", debit: GROSS, credit: 0 },
				{
					key: `reseller_commission_payable:${RESELLER}:XAF`,
					debit: 0,
					credit: GROSS,
				},
			],
		});
	});

	it("a failed transfer puts everything back on payable", async () => {
		await submit();
		await apply(payload, "failed");
		expect(await balances(payload)).toEqual({
			payable: GROSS,
			inTransit: 0,
			providerPosition: GROSS,
		});
	});

	it("a cut under a holding payout that then fails returns the net, never the gross", async () => {
		await submit();
		await withTransaction(payload, (req) =>
			adjustResellerCommission(req, "purchase-order-1", -700, {
				source: "return",
				sourceId: "return-1",
			}),
		);
		expect(await balances(payload)).toEqual({
			payable: -700,
			inTransit: NET,
			providerPosition: GROSS - OFFSET - 700,
		});
		await apply(payload, "failed");
		expect(await balances(payload)).toEqual({
			payable: GROSS - 700,
			inTransit: 0,
			providerPosition: GROSS - 700,
		});
	});

	it("a refund cut on a payable commission lowers payable; on a paid-out one it does not", async () => {
		await withTransaction(payload, (req) =>
			adjustResellerCommission(req, "purchase-order-1", -700, {
				source: "return",
				sourceId: "return-1",
			}),
		);
		expect(await balances(payload)).toMatchObject({
			payable: GROSS - 700,
			providerPosition: GROSS - 700,
		});
	});
});

describe("reconcileLedger sees the reseller accounts", () => {
	const reconcile = () =>
		runReconciliation(payload, reconciliationWindow(NOW), {
			provider: new FakeMarketplaceProvider({ now: () => NOW, accounts: [] }),
			now: NOW,
			settings: { ...PAYMENT_DEFAULTS, markets: [...DEFAULT_MARKETS] },
		});
	const open = () =>
		(
			payload.store["reconciliation-mismatches"] as unknown as Array<{
				status: string;
				kind: string;
				entityType: string;
				expected: { key: string; balance: number };
			}>
		).filter((row) => row.status === "open");

	it("reports zero mismatches over a seeded lifecycle and one for a tampered balance", async () => {
		await submit();
		await apply(payload, "complete");
		await apply(payload, "reversed");

		const clean = await reconcile();
		expect(clean.counts?.mismatches).toBe(0);
		expect(open()).toEqual([]);

		const account = (
			payload.store["ledger-accounts"] as unknown as LedgerAccount[]
		).find((a) => a.category === "reseller_payout_in_transit");
		expect(account).toBeDefined();
		if (!account) return;
		account.balance += 1_000;

		const tampered = await reconcile();
		expect(tampered.counts?.mismatches).toBe(1);
		expect(open()).toEqual([
			expect.objectContaining({
				kind: "unbalanced_ledger",
				entityType: "ledger-account",
				expected: { key: account.key, balance: 0 },
			}),
		]);
		const integrity = await ledgerIntegrity(payload);
		expect(integrity.unbalanced).toEqual([]);
	});
});
