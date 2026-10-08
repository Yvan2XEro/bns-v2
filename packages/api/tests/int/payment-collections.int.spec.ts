// @vitest-environment node
import type { CollectionConfig, Field } from "payload";
import { describe, expect, it } from "vitest";
import { BuyerFeeInvoiceFiles } from "../../src/collections/BuyerFeeInvoiceFiles";
import { BuyerFeeInvoices } from "../../src/collections/BuyerFeeInvoices";
import { CommissionInvoices } from "../../src/collections/CommissionInvoices";
import { ConnectedAccounts } from "../../src/collections/ConnectedAccounts";
import {
	LEDGER_CATEGORY_TYPES,
	LedgerAccounts,
} from "../../src/collections/LedgerAccounts";
import {
	LedgerTransactions,
	ledgerEntriesProblem,
} from "../../src/collections/LedgerTransactions";
import { MODERATION_ACTIONS } from "../../src/collections/ModerationLog";
import { Orders } from "../../src/collections/Orders";
import { PaymentIntents } from "../../src/collections/PaymentIntents";
import { PayoutAccounts } from "../../src/collections/PayoutAccounts";
import { PayoutHolds } from "../../src/collections/PayoutHolds";
import { Payouts } from "../../src/collections/Payouts";
import { ReconciliationMismatches } from "../../src/collections/ReconciliationMismatches";
import { ReconciliationRuns } from "../../src/collections/ReconciliationRuns";
import { Refunds } from "../../src/collections/Refunds";
import config from "../../src/payload.config";
import { type Doc, fakePayload, matches } from "./helpers/fakePayload";

// Access functions take Payload's generic `AccessArgs`; these specs hand them
// a partial `req`, so the function is widened to accept it (the idiom of
// `order-collection-access.int.spec.ts`).
type AnyFn = (...args: unknown[]) => unknown;
type AnyField = Field & {
	name?: string;
	fields?: AnyField[];
	options?: Array<{ value: string }>;
	unique?: boolean;
	access?: { read?: AnyFn; update?: AnyFn };
	validate?: AnyFn;
};

function seed() {
	return fakePayload({
		shops: [{ id: "s-1", status: "active", owner: "u-owner", level: 2 }],
		"shop-members": [
			{
				id: "m-1",
				shop: "s-1",
				user: "u-owner",
				role: "owner",
				status: "active",
			},
			{
				id: "m-2",
				shop: "s-1",
				user: "u-manager",
				role: "manager",
				status: "active",
			},
			{
				id: "m-3",
				shop: "s-1",
				user: "u-staff",
				role: "staff",
				status: "active",
			},
		],
	});
}

const OWNER = { id: "u-owner", role: "user" };
const MANAGER = { id: "u-manager", role: "user" };
const SHOP_STAFF = { id: "u-staff", role: "user" };
const BUYER = { id: "u-buyer", role: "user" };
const STRANGER = { id: "u-stranger", role: "user" };
const MODERATOR = { id: "u-mod", role: "moderator" };
const ADMIN = { id: "u-admin", role: "admin" };

const VIEWERS = {
	owner: OWNER,
	manager: MANAGER,
	shopStaff: SHOP_STAFF,
	buyer: BUYER,
	stranger: STRANGER,
	moderator: MODERATOR,
	anonymous: null,
} as const;
type Viewer = keyof typeof VIEWERS;

/** The row every read check is asked about: shop s-1, bought by u-buyer. */
const ROW: Doc = { id: "row-1", shop: "s-1", buyer: "u-buyer" };

async function sees(
	collection: CollectionConfig,
	viewer: Viewer,
): Promise<boolean> {
	const read = collection.access?.read as AnyFn | undefined;
	const payload = seed();
	const result = await read?.({
		req: { payload, user: VIEWERS[viewer], context: {} },
	});
	if (result === true) return true;
	if (result && typeof result === "object") return matches(ROW, result as Doc);
	return false;
}

async function readers(collection: CollectionConfig): Promise<Viewer[]> {
	const out: Viewer[] = [];
	for (const viewer of Object.keys(VIEWERS) as Viewer[]) {
		if (await sees(collection, viewer)) out.push(viewer);
	}
	return out;
}

const SHOP_MONEY: Viewer[] = ["owner", "manager", "moderator"];
const STAFF_ONLY: Viewer[] = ["moderator"];

const MATRIX: Array<[CollectionConfig, Viewer[]]> = [
	[ConnectedAccounts, SHOP_MONEY],
	[PayoutAccounts, SHOP_MONEY],
	[Refunds, ["owner", "manager", "buyer", "moderator"]],
	[Payouts, SHOP_MONEY],
	[PayoutHolds, STAFF_ONLY],
	[LedgerAccounts, STAFF_ONLY],
	[LedgerTransactions, STAFF_ONLY],
	[BuyerFeeInvoices, ["buyer", "moderator"]],
	[ReconciliationRuns, STAFF_ONLY],
	[ReconciliationMismatches, STAFF_ONLY],
];

const writeAccess = (
	collection: CollectionConfig,
	op: "create" | "update" | "delete",
	user: unknown,
) => (collection.access?.[op] as AnyFn | undefined)?.({ req: { user } });

describe("the ten payment collections: who reads, who writes", () => {
	it.each(
		MATRIX.map(([c, expected]) => [c.slug, c, expected] as const),
	)("%s is read by exactly the expected audience", async (_slug, collection, expected) => {
		expect(await readers(collection)).toEqual(expected);
	});

	it.each(
		MATRIX.map(([c]) => [c.slug, c] as const),
	)("%s refuses every client write, admins included", (slug, collection) => {
		const outcomes = (["create", "update", "delete"] as const).map((op) => [
			op,
			writeAccess(collection, op, ADMIN),
		]);
		const expectedUpdate = slug === "reconciliation-mismatches";
		expect(outcomes).toEqual([
			["create", false],
			["update", expectedUpdate],
			["delete", false],
		]);
	});

	it("lets an admin, and only an admin, update a reconciliation mismatch", () => {
		expect(
			[ADMIN, MODERATOR, OWNER, null].map((user) =>
				writeAccess(ReconciliationMismatches, "update", user),
			),
		).toEqual([true, false, false, false]);
	});

	it("keeps the invoice PDFs behind signed URLs only", async () => {
		expect(await readers(BuyerFeeInvoiceFiles)).toEqual([]);
		expect(BuyerFeeInvoiceFiles.upload).toMatchObject({
			mimeTypes: ["application/pdf"],
		});
	});

	it("registers the ten collections, plus the invoice files, in the config", async () => {
		const slugs = new Set<string>(
			(await config).collections.map((c) => c.slug),
		);
		const ours = [
			"connected-accounts",
			"payout-accounts",
			"refunds",
			"payouts",
			"payout-holds",
			"ledger-accounts",
			"ledger-transactions",
			"buyer-fee-invoices",
			"buyer-fee-invoice-files",
			"reconciliation-runs",
			"reconciliation-mismatches",
		];
		expect(ours.filter((slug) => slugs.has(slug))).toEqual(ours);
	});
});

const field = (fields: Field[], name: string): AnyField => {
	const found = (fields as AnyField[]).find((f) => f.name === name);
	if (!found) throw new Error(`no field ${name}`);
	return found;
};
const values = (fields: Field[], name: string): string[] =>
	(field(fields, name).options ?? []).map((o) => o.value);

describe("field-level reads", () => {
	const doc = { shop: "s-1", customer: "u-buyer" };
	const fieldReaders = async (f: AnyField) => {
		const out: Viewer[] = [];
		for (const viewer of Object.keys(VIEWERS) as Viewer[]) {
			const result = await f.access?.read?.({
				req: { payload: seed(), user: VIEWERS[viewer], context: {} },
				doc,
			});
			if (result === true) out.push(viewer);
		}
		return out;
	};

	it("shows the full payout account number to the owner and staff only", async () => {
		expect(
			await fieldReaders(field(PayoutAccounts.fields, "accountNumber")),
		).toEqual(["owner", "moderator"]);
	});

	it("shows the masked number to whoever reads the row", () => {
		expect(
			field(PayoutAccounts.fields, "accountNumberMasked").access?.read,
		).toBeUndefined();
	});

	it("shows an intent's payer phone to its customer and staff only", async () => {
		expect(
			await fieldReaders(field(PaymentIntents.fields, "payerPhone")),
		).toEqual(["buyer", "moderator"]);
	});
});

describe("ledger-transactions refuses an unbalanced posting at the collection", () => {
	const hook = LedgerTransactions.hooks?.beforeValidate?.[0] as AnyFn;
	const balanced = [
		{ account: "la-1", debit: 10_300, credit: 0 },
		{ account: "la-2", debit: 0, credit: 8_808 },
		{ account: "la-3", debit: 0, credit: 1_492 },
	];

	it("accepts a balanced posting and hands the data back unchanged", () => {
		const data = { kind: "charge", entries: balanced };
		expect(hook({ data, operation: "create" })).toBe(data);
	});

	it("refuses debits that do not equal credits", () => {
		const entries = [
			balanced[0],
			{ ...balanced[1], credit: 8_807 },
			balanced[2],
		];
		expect(() => hook({ data: { entries }, operation: "create" })).toThrow(
			"Unbalanced posting: debits 10300, credits 10299.",
		);
	});

	it("names each other malformed shape", () => {
		expect(
			[
				[balanced[0]],
				[
					{ account: "la-1", debit: 5, credit: 5 },
					{ account: "la-2", debit: 0, credit: 0 },
				],
				[
					{ account: "la-1", debit: 1.5, credit: 0 },
					{ account: "la-2", credit: 1.5 },
				],
				[{ debit: 5 }, { account: "la-2", credit: 5 }],
			].map(ledgerEntriesProblem),
		).toEqual([
			"A posting has at least two entries.",
			"Entry 0 must carry an amount on exactly one side.",
			"Entry 0 is not a whole amount of zero or more.",
			"Entry 0 names no account.",
		]);
	});

	it("is append-only even for an overrideAccess writer", async () => {
		expect(() =>
			hook({ data: { entries: balanced }, operation: "update" }),
		).toThrow("The ledger is append-only.");
		const beforeDelete = LedgerTransactions.hooks?.beforeDelete?.[0] as AnyFn;
		expect(() => beforeDelete({})).toThrow("The ledger is append-only.");
	});
});

describe("payout-accounts leaves one-active-per-shop to the service", () => {
	const uniques = (c: CollectionConfig) => [
		...(c.fields as AnyField[]).filter((f) => f.unique).map((f) => f.name),
		...(c.indexes ?? []).filter((i) => i.unique).map((i) => i.fields.join("+")),
	];

	it("carries no uniqueness and no hook that could refuse a second active row", () => {
		expect(uniques(PayoutAccounts)).toEqual([]);
		const hooks = PayoutAccounts.hooks ?? {};
		expect([
			...(hooks.beforeValidate ?? []),
			...(hooks.beforeChange ?? []),
		]).toHaveLength(0);
	});

	it("the same check does see connected-accounts' shop+provider uniqueness", () => {
		expect(uniques(ConnectedAccounts)).toEqual([
			"providerAccountId",
			"shop+provider",
		]);
	});

	it("validates the account number against the method", () => {
		const validate = field(PayoutAccounts.fields, "accountNumber")
			.validate as AnyFn;
		const run = (method: string, value: string) =>
			validate(value, { siblingData: { method } });
		expect([
			run("mtn_momo", "+237670000001"),
			run("orange_money", "+237690000001"),
			run("bank", "12345123451234567890112"),
			run("mtn_momo", "+237690000001"),
			run("orange_money", "690000001"),
			run("bank", "1234"),
		]).toEqual([
			true,
			true,
			true,
			"The number is not an E.164 mobile number of this operator.",
			"The number is not an E.164 mobile number of this operator.",
			"A RIB has exactly 23 digits.",
		]);
	});
});

describe("the extensions", () => {
	it("payment-intents accepts purpose checkout with targetType order", () => {
		expect(values(PaymentIntents.fields, "purpose")).toEqual([
			"boost",
			"commission",
			"checkout",
			"reseller_charge",
		]);
		expect(values(PaymentIntents.fields, "targetType")).toEqual([
			"boost-payment",
			"commission-invoice",
			"order",
			"reseller-charge",
		]);
		expect(values(PaymentIntents.fields, "channel")).toEqual([
			"cm.mtn",
			"cm.orange",
		]);
		expect(values(PaymentIntents.fields, "failureCode")).toEqual([
			"declined",
			"insufficient_funds",
			"timeout",
			"limit_exceeded",
			"invalid_number",
			"provider_error",
		]);
		const attempt = field(PaymentIntents.fields, "attempt").validate as AnyFn;
		expect([1, 3, 0, 4, 1.5].map((v) => attempt(v))).toEqual([
			true,
			true,
			"An intent is attempt 1, 2 or 3.",
			"An intent is attempt 1, 2 or 3.",
			"An intent is attempt 1, 2 or 3.",
		]);
	});

	it("orders gain the settlement group and the frozen split amounts", () => {
		const amounts = field(Orders.fields, "amounts").fields ?? [];
		expect(amounts.map((f) => f.name)).toEqual([
			"subtotal",
			"deliveryFee",
			"discount",
			"buyerProtectionFee",
			"total",
			"currency",
			"buyerProtectionFeeVat",
			"commission",
			"commissionVat",
			"applicationFee",
			"destinationAmount",
		]);
		const settlement = field(Orders.fields, "settlement").fields ?? [];
		expect(settlement.map((f) => f.name)).toEqual([
			"mode",
			"releaseModel",
			"connectedAccount",
			"releaseEligibleAt",
			"releasedAt",
			"payout",
			"refundedAmount",
		]);
		expect(values(settlement, "releaseModel")).toEqual([
			"provider_hold",
			"provider_schedule",
		]);
	});

	it("commission-invoices gain settlement, mobile_money by default", () => {
		expect(values(CommissionInvoices.fields, "settlement")).toEqual([
			"mobile_money",
			"application_fee",
		]);
		expect(field(CommissionInvoices.fields, "settlement")).toMatchObject({
			defaultValue: "mobile_money",
		});
	});

	it("moderation-log gains the four payout actions", () => {
		expect(MODERATION_ACTIONS.filter((a) => a.startsWith("payout."))).toEqual([
			"payout.hold",
			"payout.release",
			"payout.account_approve",
			"payout.account_reject",
		]);
	});
});

describe("the collection-level rules", () => {
	it("refuses a standard connected account", () => {
		const validate = field(ConnectedAccounts.fields, "accountType")
			.validate as AnyFn;
		expect(["express", "custom", "standard"].map((v) => validate(v))).toEqual([
			true,
			true,
			"A standard account lets the seller change the payout schedule and defeat release control.",
		]);
	});

	it("makes a refund's breakdown add up to its amount", () => {
		const validate = field(Refunds.fields, "amount").validate as AnyFn;
		const breakdown = {
			seller: 8_808,
			commission: 1_000,
			commissionVat: 193,
			buyerProtectionFee: 299,
		};
		expect([
			validate(10_300, { siblingData: { breakdown } }),
			validate(10_000, { siblingData: { breakdown } }),
			validate(0, { siblingData: {} }),
		]).toEqual([
			true,
			"The breakdown adds up to 10300, not the refunded 10000.",
			"A refund amount is a whole number above zero.",
		]);
	});

	it("makes an order-scoped hold name its order", () => {
		const validate = field(PayoutHolds.fields, "order").validate as AnyFn;
		expect([
			validate(undefined, { siblingData: { scope: "order" } }),
			validate("o-1", { siblingData: { scope: "order" } }),
			validate(undefined, { siblingData: { scope: "shop" } }),
		]).toEqual(["An order hold must name its order.", true, true]);
	});

	it("types every ledger category per the chart of accounts", () => {
		expect(values(LedgerAccounts.fields, "category")).toEqual(
			Object.keys(LEDGER_CATEGORY_TYPES),
		);
		expect(
			Object.entries(LEDGER_CATEGORY_TYPES)
				.filter(([, t]) => t === "asset")
				.map(([c]) => c),
		).toEqual(["provider_position", "seller_receivable"]);
	});

	it("needs a staff note to close a mismatch, and records who closed it", () => {
		const hook = ReconciliationMismatches.hooks?.beforeChange?.[0] as AnyFn;
		const originalDoc = { status: "open", note: null };
		const req = { user: ADMIN };
		expect(() =>
			hook({ data: { status: "resolved" }, originalDoc, req }),
		).toThrow("A mismatch closed as resolved needs a staff note.");
		expect(
			hook({
				data: { status: "ignored", note: "Provider test charge" },
				originalDoc,
				req,
			}),
		).toEqual({
			status: "ignored",
			note: "Provider test charge",
			resolvedBy: "u-admin",
		});
	});

	it("lets the admin write only status and note on a mismatch", () => {
		const writable = (ReconciliationMismatches.fields as AnyField[])
			.filter((f) => f.name !== "createdAt" && f.name !== "updatedAt")
			.filter((f) => f.access?.update === undefined)
			.map((f) => f.name);
		expect(writable).toEqual(["status", "note"]);
	});
});
