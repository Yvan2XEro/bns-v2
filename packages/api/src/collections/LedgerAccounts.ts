import type { CollectionConfig } from "payload";
import { nobody, staffOnly } from "../access/staff";

export const LEDGER_ACCOUNT_TYPES = [
	"asset",
	"liability",
	"revenue",
	"expense",
] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];

/** The chart of accounts: each category has exactly one type. */
export const LEDGER_CATEGORY_TYPES = {
	provider_position: "asset",
	seller_pending: "liability",
	seller_releasable: "liability",
	seller_payout_in_transit: "liability",
	seller_receivable: "asset",
	buyer_refund_in_transit: "liability",
	platform_fee_unearned: "liability",
	platform_revenue_commission: "revenue",
	platform_revenue_protection_fee: "revenue",
	vat_payable: "liability",
	provider_fee_expense: "expense",
	buyer_guarantee_expense: "expense",
} as const satisfies Record<string, LedgerAccountType>;

export type LedgerCategory = keyof typeof LEDGER_CATEGORY_TYPES;
export const LEDGER_CATEGORIES = Object.keys(
	LEDGER_CATEGORY_TYPES,
) as LedgerCategory[];

const options = (values: readonly string[]) =>
	values.map((value) => ({ label: value, value }));

/**
 * A mirror of positions at the provider and of BuyNSellem's own revenue,
 * never a balance anyone can spend. `key` is `{category}:{shopId|platform}:{currency}`;
 * `balance` is a cache `$inc`'d by `services/ledger.ts` in the posting's
 * transaction and recomputed from entries nightly.
 */
export const LedgerAccounts: CollectionConfig = {
	slug: "ledger-accounts",
	admin: {
		useAsTitle: "key",
		defaultColumns: ["key", "category", "type", "balance"],
	},
	access: {
		read: staffOnly,
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	fields: [
		{ name: "key", type: "text", required: true, unique: true },
		{
			name: "category",
			type: "select",
			required: true,
			index: true,
			options: options(LEDGER_CATEGORIES),
		},
		{
			name: "type",
			type: "select",
			required: true,
			options: options(LEDGER_ACCOUNT_TYPES),
		},
		{ name: "shop", type: "relationship", relationTo: "shops", index: true },
		{ name: "currency", type: "text", required: true },
		{ name: "balance", type: "number", required: true, defaultValue: 0 },
	],
	timestamps: true,
};
