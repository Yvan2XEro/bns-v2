import type { CollectionConfig } from "payload";
import { can, shopRoleFieldAccess, shopScopedRead } from "../access/shopRoles";
import { nobody, staffOnly } from "../access/staff";

const options = (values: readonly string[]) =>
	values.map((value) => ({ label: value, value }));

const money = (name: string) => ({
	name,
	type: "number" as const,
	required: true,
	min: 0,
	access: {
		read: shopRoleFieldAccess((role) => can(role, "payments.view")),
	},
});

export const ResellerPayouts: CollectionConfig = {
	slug: "reseller-payouts",
	admin: {
		useAsTitle: "reference",
		defaultColumns: ["reference", "resellerShop", "amount", "status"],
		group: "Resale",
	},
	access: {
		read: shopScopedRead(staffOnly, "resellerShop", (role) =>
			can(role, "payments.view"),
		),
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	indexes: [{ fields: ["resellerShop", "status", "createdAt"] }],
	fields: [
		{
			type: "row",
			fields: [
				{
					name: "reference",
					type: "text",
					required: true,
					unique: true,
					admin: { width: "50%" },
				},
				{
					name: "resellerShop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			name: "payoutAccount",
			type: "relationship",
			relationTo: "payout-accounts",
			required: true,
		},
		{
			name: "commissions",
			type: "relationship",
			relationTo: "reseller-commissions",
			hasMany: true,
		},
		{
			name: "charges",
			type: "relationship",
			relationTo: "reseller-charges",
			hasMany: true,
		},
		{
			type: "row",
			fields: [
				{ ...money("grossAmount"), admin: { width: "33%" } },
				{ ...money("offsetAmount"), admin: { width: "33%" } },
				{ ...money("amount"), admin: { width: "33%" } },
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "fee",
					type: "number",
					required: true,
					min: 0,
					admin: { width: "50%" },
				},
				{
					name: "status",
					type: "select",
					required: true,
					defaultValue: "scheduled",
					options: options([
						"scheduled",
						"awaiting_approval",
						"pending",
						"sent",
						"processing",
						"complete",
						"failed",
						"reversed",
						"cancelled",
					]),
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "approvedBy",
					type: "relationship",
					relationTo: "users",
					admin: { width: "33%" },
				},
				{ name: "approvedAt", type: "date", admin: { width: "33%" } },
				{
					name: "providerTransferId",
					type: "text",
					unique: true,
					admin: { width: "33%" },
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
							type: "text",
							required: true,
							admin: { width: "25%" },
						},
						{
							name: "actor",
							type: "relationship",
							relationTo: "users",
							admin: { width: "25%" },
						},
						{
							name: "source",
							type: "text",
							required: true,
							admin: { width: "25%" },
						},
						{
							name: "at",
							type: "date",
							required: true,
							admin: { width: "25%" },
						},
					],
				},
			],
		},
		{ name: "failureReason", type: "text" },
	],
	timestamps: true,
};
