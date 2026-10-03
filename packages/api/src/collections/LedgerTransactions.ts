import { APIError, type CollectionConfig } from "payload";
import { nobody, staffOnly } from "../access/staff";

export const LEDGER_TRANSACTION_KINDS = [
	"charge",
	"provider_fee",
	"release",
	"commission_earned",
	"payout_submitted",
	"payout_complete",
	"payout_failed",
	"payout_reversed",
	"refund_submitted",
	"refund_complete",
	"refund_failed",
	"clawback_recovered",
	"guarantee_writeoff",
] as const;
export type LedgerTransactionKind = (typeof LEDGER_TRANSACTION_KINDS)[number];

export const LEDGER_SOURCE_TYPES = [
	"webhook-event",
	"reconciliation-run",
	"order-event",
] as const;

export interface LedgerEntryInput {
	account?: unknown;
	debit?: unknown;
	credit?: unknown;
}

const isWhole = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Null when the entries form a valid posting: at least two lines, each naming
 * an account and carrying a whole amount on exactly one side, Σdebit = Σcredit.
 * `services/ledger.ts` calls it before inserting; the collection hook calls
 * it again so not even an `overrideAccess` write can store an unbalanced one.
 */
export function ledgerEntriesProblem(entries: unknown): string | null {
	if (!Array.isArray(entries) || entries.length < 2) {
		return "A posting has at least two entries.";
	}
	let debits = 0;
	let credits = 0;
	for (const [index, raw] of entries.entries()) {
		const entry = (raw ?? {}) as LedgerEntryInput;
		const debit = entry.debit ?? 0;
		const credit = entry.credit ?? 0;
		if (!entry.account) return `Entry ${index} names no account.`;
		if (!isWhole(debit) || !isWhole(credit)) {
			return `Entry ${index} is not a whole amount of zero or more.`;
		}
		if (debit > 0 === credit > 0) {
			return `Entry ${index} must carry an amount on exactly one side.`;
		}
		debits += debit;
		credits += credit;
	}
	return debits === credits
		? null
		: `Unbalanced posting: debits ${debits}, credits ${credits}.`;
}

const APPEND_ONLY = "The ledger is append-only.";

/**
 * Append-only and closed to every request, admins included: only
 * `services/ledger.ts` writes it, with `overrideAccess`, and the hooks below
 * are what still bind that writer.
 */
export const LedgerTransactions: CollectionConfig = {
	slug: "ledger-transactions",
	admin: {
		useAsTitle: "idempotencyKey",
		defaultColumns: ["kind", "idempotencyKey", "order", "postedAt"],
	},
	access: {
		read: staffOnly,
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	hooks: {
		beforeValidate: [
			({ data, operation }) => {
				if (operation !== "create") throw new APIError(APPEND_ONLY, 400);
				const problem = ledgerEntriesProblem(data?.entries);
				if (problem) throw new APIError(problem, 400);
				return data;
			},
		],
		beforeDelete: [
			() => {
				throw new APIError(APPEND_ONLY, 400);
			},
		],
	},
	fields: [
		{ name: "idempotencyKey", type: "text", required: true, unique: true },
		{
			name: "kind",
			type: "select",
			required: true,
			index: true,
			options: LEDGER_TRANSACTION_KINDS.map((value) => ({
				label: value,
				value,
			})),
		},
		{ name: "occurredAt", type: "date", required: true },
		{ name: "postedAt", type: "date", required: true },
		{
			name: "sourceType",
			type: "select",
			required: true,
			options: LEDGER_SOURCE_TYPES.map((value) => ({ label: value, value })),
		},
		{ name: "sourceId", type: "text", required: true, index: true },
		{ name: "order", type: "relationship", relationTo: "orders", index: true },
		{ name: "shop", type: "relationship", relationTo: "shops", index: true },
		{
			name: "paymentIntent",
			type: "relationship",
			relationTo: "payment-intents",
		},
		{ name: "refund", type: "relationship", relationTo: "refunds" },
		{ name: "payout", type: "relationship", relationTo: "payouts" },
		{
			name: "entries",
			type: "array",
			required: true,
			minRows: 2,
			fields: [
				{
					name: "account",
					type: "relationship",
					relationTo: "ledger-accounts",
					required: true,
					index: true,
				},
				{ name: "debit", type: "number", required: true, defaultValue: 0 },
				{ name: "credit", type: "number", required: true, defaultValue: 0 },
			],
		},
		{
			name: "reverses",
			type: "relationship",
			relationTo: "ledger-transactions",
		},
		{ name: "memo", type: "text" },
	],
	timestamps: true,
};
