// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	type BuyerFeeDocument,
	buyerFeeDocumentLines,
} from "../../src/lib/commissionInvoiceDocument";
import { withTransaction } from "../../src/lib/transactions";
import type {
	LedgerAccount,
	LedgerTransaction,
	Order,
	PaymentIntent,
	ResellerCommission,
} from "../../src/payload-types";
import { issueBuyerFeeInvoice } from "../../src/services/buyerFeeInvoices";
import {
	accountBalance,
	LedgerPostingError,
	ledgerIntegrity,
	type PostLedgerInput,
	postingFor,
	postLedger,
} from "../../src/services/ledger";
import { postCommissionPayable } from "../../src/services/resellerLedger";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

const world = () =>
	fakePayload(
		{
			orders: [
				{
					id: "order-xaf",
					orderNumber: "BNS-1",
					amounts: { currency: "XAF" },
				},
				{
					id: "order-rwf",
					orderNumber: "BNS-2",
					amounts: { currency: "RWF" },
				},
			],
		},
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

let seq = 0;
const charge = (extra: Partial<PostLedgerInput>): PostLedgerInput => {
	seq += 1;
	return {
		kind: "provider_fee",
		entries: postingFor("provider_fee", { fee: 500, bearer: "platform" }),
		occurredAt: "2026-10-03T10:00:00.000Z",
		sourceType: "webhook-event",
		sourceId: `evt-${seq}`,
		currency: "XAF",
		shop: "shop-1",
		...extra,
	};
};

const post = (payload: FakePayload, input: PostLedgerInput) =>
	withTransaction(payload, (req) => postLedger(req, input));

describe("the ledger refuses a posting whose currency is not its order's", () => {
	it("throws the exact error and rolls the enclosing transaction back", async () => {
		const payload = world();
		await post(payload, charge({ order: "order-xaf" }));
		const clean = { transactions: 1, accounts: accounts(payload).length };

		await expect(
			withTransaction(payload, async (req) => {
				await postLedger(
					req,
					charge({ order: "order-xaf", sourceId: "evt-other" }),
				);
				await postLedger(req, charge({ order: "order-xaf", currency: "RWF" }));
			}),
		).rejects.toThrow(
			new LedgerPostingError(
				"currency mismatch: posting RWF against order BNS-1 in XAF",
			),
		);

		expect({
			transactions: transactions(payload).length,
			accounts: accounts(payload).length,
		}).toEqual(clean);
	});

	it("posts a non-CM order in its own currency, whole-object", async () => {
		const payload = world();
		await post(payload, charge({ order: "order-rwf", currency: "RWF" }));
		const byId = new Map(accounts(payload).map((a) => [String(a.id), a.key]));
		expect(
			transactions(payload).map((t) => ({
				kind: t.kind,
				order: t.order,
				entries: t.entries.map((e) => ({
					key: byId.get(String(e.account)),
					debit: e.debit,
					credit: e.credit,
				})),
			})),
		).toEqual([
			{
				kind: "provider_fee",
				order: "order-rwf",
				entries: [
					{
						key: "provider_fee_expense:platform:RWF",
						debit: 500,
						credit: 0,
					},
					{ key: "provider_position:platform:RWF", debit: 0, credit: 500 },
				],
			},
		]);
		expect(
			await accountBalance(payload, "provider_position", null, "RWF"),
		).toBe(-500);
	});

	it("does not refuse a posting that names no order", async () => {
		const payload = world();
		await post(payload, charge({ currency: "RWF" }));
		expect(transactions(payload)).toHaveLength(1);
	});
});

describe("reconciliation reads each currency on its own", () => {
	it("flags a gap planted in one currency only, named by it", async () => {
		const payload = world();
		await post(payload, charge({ order: "order-xaf" }));
		await post(payload, charge({ order: "order-rwf", currency: "RWF" }));
		const rwf = accounts(payload).find((a) => a.currency === "RWF");
		const planted = transactions(payload).find((t) =>
			t.entries.some((e) => String(e.account) === String(rwf?.id)),
		);
		if (!planted) throw new Error("no RWF posting");
		planted.entries[0].debit += 7;

		const integrity = await ledgerIntegrity(payload);
		expect(integrity.byCurrency).toEqual({
			XAF: { debit: 500, credit: 500 },
			RWF: { debit: 507, credit: 500 },
		});
		expect(integrity.unbalanced).toEqual([
			{
				transaction: String(planted.id),
				currency: "RWF",
				debit: 507,
				credit: 500,
			},
		]);
	});
});

const RWANDA = {
	id: "market-rw",
	countryCode: "RW",
	name: "Rwanda",
	status: "live",
	currency: { code: "RWF", minorUnit: 0, rounding: "half_up" },
	formatting: [
		{
			locale: "en",
			symbol: "RWF",
			position: "before",
			groupSeparator: ",",
			decimalSeparator: ".",
		},
	],
	phone: { pattern: "^\\+2507\\d{8}$", displayExample: "+250 7 88 00 00 00" },
	timezone: "Africa/Kigali",
	languages: ["en"],
	vatRateBps: 1800,
	payments: {
		provider: "notchpay",
		settlementMode: "provider_split",
		channels: ["rw.mtn"],
		enabled: true,
	},
	features: { cod: true, protectedPayment: true, boosts: true },
	amounts: {
		minPayout: 1000,
		maxOrderAmount: 1_000_000,
		exposureLevel2: 500_000,
		exposureLevel3: 2_000_000,
		buyerProtectionMin: 100,
		buyerProtectionMax: 15_000,
		defaultDeliveryFeeFallback: 1500,
	},
	moneyCalendar: {
		releaseHourLocal: 10,
		reconcileHourLocal: 2,
		vatPeriod: "calendar_month",
	},
	updatedAt: "2026-10-09T10:00:00.000Z",
};

describe("the buyer fee invoice follows its order's market", () => {
	const rwandanOrder = {
		id: "order-rw",
		orderNumber: "BNS-RW-1",
		market: "market-rw",
		shop: "shop-rw",
		buyer: "buyer-1",
		delivery: { recipientName: "Aline" },
		amounts: {
			currency: "RWF",
			buyerProtectionFee: 1_180,
			buyerProtectionFeeVat: 180,
		},
	};
	const intent = {
		id: "pi-rw",
		updatedAt: "2026-10-09T10:00:00.000Z",
		statusHistory: [],
	};

	it("freezes the order's currency, its market's rate and formats, and renders through them", async () => {
		const payload = fakePayload(
			{
				markets: [RWANDA],
				orders: [rwandanOrder],
				shops: [{ id: "shop-rw", name: "Boutique" }],
				sequences: [],
				"buyer-fee-invoices": [],
				"buyer-fee-invoice-files": [],
			},
			{
				uniques: {
					"buyer-fee-invoices": [["number"]],
					sequences: [["key"]],
				},
			},
		);
		const invoice = await withTransaction(payload, (req) =>
			issueBuyerFeeInvoice(
				req,
				rwandanOrder as unknown as Order,
				intent as unknown as PaymentIntent,
			),
		);
		expect({
			currency: invoice?.currency,
			vatRateBps: invoice?.vatRateBps,
			amountHt: invoice?.amountHt,
			vat: invoice?.vat,
			amountTtc: invoice?.amountTtc,
			formatSnapshot: invoice?.formatSnapshot?.map(({ id: _id, ...f }) => f),
		}).toEqual({
			currency: "RWF",
			vatRateBps: 1800,
			amountHt: 1_000,
			vat: 180,
			amountTtc: 1_180,
			formatSnapshot: [
				{
					locale: "en",
					symbol: "RWF",
					position: "before",
					groupSeparator: ",",
					decimalSeparator: ".",
					minorUnit: 0,
				},
			],
		});
	});

	const document: BuyerFeeDocument = {
		kind: "invoice",
		number: "BNS-F-2026-000001",
		creditsNumber: null,
		issuedAt: "2026-10-03T12:00:00.000Z",
		paidAt: null,
		orderNumber: "BNS-1",
		customerName: "Awa",
		amountHt: 1_000,
		vat: 410,
		amountTtc: 1_410,
		vatRateBps: 1925,
		issuer: { legalName: "BNS", supportEmail: "help@bns.example" },
	};

	it("reads in the snapshot's own symbol, and never as FCFA for another currency", () => {
		const text = buyerFeeDocumentLines({
			...document,
			currency: "RWF",
			formatSnapshot: [
				{
					locale: "en",
					symbol: "RWF",
					position: "before",
					groupSeparator: ",",
					decimalSeparator: ".",
					minorUnit: 0,
				},
			],
		}).map((l) => l.text);
		expect(text).toContain("Amount incl. VAT: RWF 1,410");
		expect(text).toContain("Montant TTC : RWF 1 410");
		expect(text.join("\n")).not.toContain("FCFA");
	});

	it("renders byte-identically for CM through its snapshot and through the legacy path", () => {
		const cm = [
			{
				locale: "fr" as const,
				symbol: "FCFA",
				position: "after" as const,
				groupSeparator: "\u202f",
				decimalSeparator: ",",
				minorUnit: 0,
			},
			{
				locale: "en" as const,
				symbol: "XAF",
				position: "before" as const,
				groupSeparator: ",",
				decimalSeparator: ".",
				minorUnit: 0,
			},
		];
		expect(
			buyerFeeDocumentLines({
				...document,
				currency: "XAF",
				formatSnapshot: cm,
			}),
		).toEqual(buyerFeeDocumentLines(document));
	});
});

describe("a reseller commission is posted in its order's currency", () => {
	it("keys the payable account by RWF for a Rwandan order", async () => {
		const payload = world();
		const commission = {
			id: "commission-rw",
			resellerShop: "reseller-1",
			order: "order-rwf",
			amount: 900,
		};
		await withTransaction(payload, (req) =>
			postCommissionPayable(req, commission as unknown as ResellerCommission),
		);
		expect(accounts(payload).map((a) => a.key)).toEqual([
			"provider_position:platform:RWF",
			"reseller_commission_payable:reseller-1:RWF",
		]);
	});
});
