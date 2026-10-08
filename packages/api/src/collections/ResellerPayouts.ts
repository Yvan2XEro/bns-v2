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
		{ name: "reference", type: "text", required: true, unique: true },
		{
			name: "resellerShop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
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
		money("grossAmount"),
		money("offsetAmount"),
		money("amount"),
		{ name: "fee", type: "number", required: true, min: 0 },
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
		},
		{ name: "approvedBy", type: "relationship", relationTo: "users" },
		{ name: "approvedAt", type: "date" },
		{ name: "providerTransferId", type: "text", unique: true },
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{ name: "status", type: "text", required: true },
				{ name: "actor", type: "relationship", relationTo: "users" },
				{ name: "source", type: "text", required: true },
				{ name: "at", type: "date", required: true },
			],
		},
		{ name: "failureReason", type: "text" },
	],
	timestamps: true,
};
