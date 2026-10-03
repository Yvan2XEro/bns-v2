import type { CollectionConfig } from "payload";
import { can, shopRoleFieldAccess, shopScopedRead } from "../access/shopRoles";
import { nobody, staffOnly } from "../access/staff";
import type { NameMatchVerdict } from "../lib/nameMatch";
import { type PaymentChannel, phoneMatchesChannel } from "../lib/paymentMath";

export const PAYOUT_METHODS = ["mtn_momo", "orange_money", "bank"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

/** The operator channel whose prefixes a mobile-money payout number must carry. */
export const PAYOUT_METHOD_CHANNELS: Record<
	Exclude<PayoutMethod, "bank">,
	PaymentChannel
> = {
	mtn_momo: "cm.mtn",
	orange_money: "cm.orange",
};

export const PAYOUT_ACCOUNT_STATUSES = [
	"pending_verification",
	"pending_review",
	"active",
	"rejected",
	"replaced",
] as const;

export const NAME_MATCH_RESULTS = [
	"match",
	"partial",
	"mismatch",
] as const satisfies readonly NameMatchVerdict[];

const options = (values: readonly string[]) =>
	values.map((value) => ({ label: value, value }));

const E164 = /^\+\d{8,15}$/;
const RIB = /^\d{23}$/;

/** Defence in depth: `services/payoutAccounts.ts` answers the error codes first. */
export function payoutAccountNumberProblem(
	method: unknown,
	accountNumber: unknown,
): string | null {
	if (typeof accountNumber !== "string" || !accountNumber) {
		return "The account number is required.";
	}
	if (method === "bank") {
		return RIB.test(accountNumber) ? null : "A RIB has exactly 23 digits.";
	}
	if (method === "mtn_momo" || method === "orange_money") {
		return E164.test(accountNumber) &&
			phoneMatchesChannel(accountNumber, PAYOUT_METHOD_CHANNELS[method])
			? null
			: "The number is not an E.164 mobile number of this operator.";
	}
	return "Unknown payout method.";
}

/**
 * At most one `active` row per shop is a service rule
 * (`services/payoutAccounts.ts`, inside a transaction), deliberately not a
 * unique index: activation replaces the previous row in the same
 * transaction, and an index would refuse the intermediate state. Rows are
 * never deleted (Law 2010/021 art. 32); a change creates a new row.
 */
export const PayoutAccounts: CollectionConfig = {
	slug: "payout-accounts",
	admin: {
		useAsTitle: "accountNumberMasked",
		defaultColumns: ["shop", "method", "accountNumberMasked", "status"],
	},
	access: {
		read: shopScopedRead(staffOnly, "shop", (role) =>
			can(role, "payments.view"),
		),
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	fields: [
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "method",
			type: "select",
			required: true,
			options: options(PAYOUT_METHODS),
		},
		{
			name: "accountName",
			type: "text",
			required: true,
			minLength: 2,
			maxLength: 80,
		},
		{
			name: "accountNumber",
			type: "text",
			required: true,
			// The full number is an owner matter: a manager sees the masked copy.
			access: {
				read: shopRoleFieldAccess((role) => can(role, "payments.manage")),
			},
			validate: (value: unknown, { siblingData }: { siblingData: unknown }) =>
				payoutAccountNumberProblem(
					(siblingData as { method?: unknown }).method,
					value,
				) ?? true,
		},
		{ name: "accountNumberMasked", type: "text" },
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "pending_verification",
			index: true,
			options: options(PAYOUT_ACCOUNT_STATUSES),
		},
		{
			name: "nameMatch",
			type: "group",
			fields: [
				{ name: "identityName", type: "text" },
				{ name: "providerName", type: "text" },
				{
					name: "result",
					type: "select",
					options: options(NAME_MATCH_RESULTS),
				},
				{ name: "score", type: "number", min: 0, max: 1 },
				{ name: "checkedAt", type: "date" },
			],
		},
		{ name: "providerRecipientId", type: "text" },
		{ name: "activatedAt", type: "date" },
		{ name: "replacedAt", type: "date" },
		{ name: "createdBy", type: "relationship", relationTo: "users" },
	],
	timestamps: true,
};
