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
			type: "row",
			fields: [
				{
					name: "resellerShop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
				{
					name: "supplierShop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "purchaseOrder",
					type: "relationship",
					relationTo: "purchase-orders",
					required: true,
					admin: { width: "50%" },
				},
				{
					name: "order",
					type: "relationship",
					relationTo: "orders",
					required: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{ ...money("saleAmount"), admin: { width: "25%" } },
				{ ...money("supplierAmount"), admin: { width: "25%" } },
				{ ...money("platformCommission"), admin: { width: "25%" } },
				{ ...money("amount"), min: 0, admin: { width: "25%" } },
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "paymentMethod",
					type: "select",
					required: true,
					options: options(["cod", "mobile_money"]),
					admin: { width: "50%" },
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
					admin: { width: "50%" },
				},
			],
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
			type: "row",
			fields: [
				{
					name: "marginLine",
					type: "relationship",
					relationTo: "commission-lines",
					admin: { width: "50%" },
				},
				{
					name: "payout",
					type: "relationship",
					relationTo: "reseller-payouts",
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{ name: "paidAt", type: "date", admin: { width: "50%" } },
				{
					name: "cancelReason",
					type: "select",
					options: options(["returned", "refunded", "fraud", "moderation"]),
					admin: { width: "50%" },
				},
			],
		},
		{
			name: "adjustments",
			type: "array",
			admin: { readOnly: true },
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "source",
							type: "select",
							required: true,
							options: options(["dispute", "return", "cod_refusal"]),
							admin: { width: "33%" },
						},
						{
							name: "sourceId",
							type: "text",
							required: true,
							admin: { width: "33%" },
						},
						{
							name: "delta",
							type: "number",
							required: true,
							admin: { width: "33%" },
						},
					],
				},
			],
		},
	],
	timestamps: true,
};
