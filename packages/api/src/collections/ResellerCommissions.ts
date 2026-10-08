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
		read: shopRoleFieldAccess(
			(role) => can(role, "payments.view"),
			"resellerShop",
		),
	},
});

export const ResellerCommissions: CollectionConfig = {
	slug: "reseller-commissions",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["resellerShop", "purchaseOrder", "amount", "status"],
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
	indexes: [
		{ fields: ["purchaseOrder"], unique: true },
		{ fields: ["resellerShop", "status"] },
		{ fields: ["supplierShop", "status"] },
	],
	fields: [
		{
			name: "resellerShop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "supplierShop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "purchaseOrder",
			type: "relationship",
			relationTo: "purchase-orders",
			required: true,
		},
		{
			name: "order",
			type: "relationship",
			relationTo: "orders",
			required: true,
		},
		money("saleAmount"),
		money("supplierAmount"),
		money("platformCommission"),
		{ ...money("amount"), min: 0 },
		{
			name: "paymentMethod",
			type: "select",
			required: true,
			options: options(["cod", "mobile_money"]),
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "accrued",
			options: options([
				"accrued",
				"payable",
				"held",
				"paid",
				"cancelled",
				"clawed_back",
			]),
		},
		{
			name: "holdReasons",
			type: "select",
			hasMany: true,
			options: options([
				"invoice_unpaid",
				"dispute_open",
				"collusion_review",
				"moderation",
			]),
		},
		{
			name: "marginLine",
			type: "relationship",
			relationTo: "commission-lines",
		},
		{
			name: "payout",
			type: "relationship",
			relationTo: "reseller-payouts",
		},
		{ name: "paidAt", type: "date" },
		{
			name: "cancelReason",
			type: "select",
			options: options(["returned", "refunded", "fraud", "moderation"]),
		},
		{
			name: "adjustments",
			type: "array",
			admin: { readOnly: true },
			fields: [
				{
					name: "source",
					type: "select",
					required: true,
					options: options(["dispute", "return", "cod_refusal"]),
				},
				{ name: "sourceId", type: "text", required: true },
				{ name: "delta", type: "number", required: true },
			],
		},
	],
	timestamps: true,
};
