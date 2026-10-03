import type { CollectionConfig } from "payload";
import { can, shopScopedRead } from "../access/shopRoles";
import { nobody, staffOnly } from "../access/staff";
import type { NormalisedTransferStatus } from "../lib/payments/marketplace";
import { MONEY_STATUS_SOURCES } from "./Refunds";

export const PAYOUT_ORIGINS = [
	"platform_release",
	"provider_schedule",
] as const;

/** `scheduled` and `cancelled` describe a row never submitted to the provider. */
export const PAYOUT_STATUSES = [
	"scheduled",
	"pending",
	"sent",
	"processing",
	"complete",
	"failed",
	"reversed",
	"cancelled",
] as const satisfies readonly (
	| "scheduled"
	| "cancelled"
	| NormalisedTransferStatus
)[];

const options = (values: readonly string[]) =>
	values.map((value) => ({ label: value, value }));

export const Payouts: CollectionConfig = {
	slug: "payouts",
	admin: {
		useAsTitle: "providerTransferId",
		defaultColumns: ["shop", "amount", "origin", "status", "createdAt"],
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
			name: "connectedAccount",
			type: "relationship",
			relationTo: "connected-accounts",
			required: true,
		},
		{
			name: "payoutAccount",
			type: "relationship",
			relationTo: "payout-accounts",
		},
		{ name: "amount", type: "number", required: true },
		{ name: "fee", type: "number" },
		{ name: "currency", type: "text", required: true },
		{
			// Empty for a `provider_schedule` payout the provider created itself.
			name: "orders",
			type: "array",
			fields: [
				{
					name: "order",
					type: "relationship",
					relationTo: "orders",
					required: true,
				},
				{ name: "amount", type: "number", required: true },
			],
		},
		{
			name: "origin",
			type: "select",
			required: true,
			options: options(PAYOUT_ORIGINS),
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "scheduled",
			index: true,
			options: options(PAYOUT_STATUSES),
		},
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{
					name: "status",
					type: "select",
					required: true,
					options: options(PAYOUT_STATUSES),
				},
				{
					name: "source",
					type: "select",
					required: true,
					options: options(MONEY_STATUS_SOURCES),
				},
				{ name: "at", type: "date", required: true },
			],
		},
		// Sparse unique: leave it out, never null, until the provider answers.
		{ name: "providerTransferId", type: "text", unique: true },
		{ name: "failureReason", type: "text" },
	],
	timestamps: true,
};
