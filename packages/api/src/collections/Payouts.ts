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
			type: "row",
			fields: [
				{
					name: "shop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
				{
					name: "connectedAccount",
					type: "relationship",
					relationTo: "connected-accounts",
					required: true,
					admin: { width: "33%" },
				},
				{
					name: "payoutAccount",
					type: "relationship",
					relationTo: "payout-accounts",
					admin: { width: "34%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "amount",
					type: "number",
					required: true,
					admin: { width: "33%" },
				},
				{ name: "fee", type: "number", admin: { width: "33%" } },
				{
					name: "currency",
					type: "text",
					required: true,
					admin: { width: "34%" },
				},
			],
		},
		{
			// Empty for a `provider_schedule` payout the provider created itself.
			name: "orders",
			type: "array",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "order",
							type: "relationship",
							relationTo: "orders",
							required: true,
							admin: { width: "50%" },
						},
						{
							name: "amount",
							type: "number",
							required: true,
							admin: { width: "50%" },
						},
					],
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "origin",
					type: "select",
					required: true,
					options: options(PAYOUT_ORIGINS),
					admin: { width: "50%" },
				},
				{
					name: "status",
					type: "select",
					required: true,
					defaultValue: "scheduled",
					index: true,
					options: options(PAYOUT_STATUSES),
					admin: { width: "50%" },
				},
			],
		},
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "status",
							type: "select",
							required: true,
							options: options(PAYOUT_STATUSES),
							admin: { width: "33%" },
						},
						{
							name: "source",
							type: "select",
							required: true,
							options: options(MONEY_STATUS_SOURCES),
							admin: { width: "33%" },
						},
						{
							name: "at",
							type: "date",
							required: true,
							admin: { width: "34%" },
						},
					],
				},
			],
		},
		// Sparse unique: leave it out, never null, until the provider answers.
		{
			type: "row",
			fields: [
				{
					name: "providerTransferId",
					type: "text",
					unique: true,
					admin: { width: "50%" },
				},
				{ name: "failureReason", type: "text", admin: { width: "50%" } },
			],
		},
	],
	timestamps: true,
};
