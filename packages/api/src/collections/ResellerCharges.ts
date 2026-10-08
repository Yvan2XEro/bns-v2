import type { CollectionConfig, FieldAccess } from "payload";
import { can, shopRoleFieldAccess, shopScopedRead } from "../access/shopRoles";
import { nobody, staffOnly, staffOnlyField } from "../access/staff";

const options = (values: readonly string[]) =>
	values.map((value) => ({ label: value, value }));

const resellerMoneyRead: FieldAccess = shopRoleFieldAccess(
	(role) => can(role, "payments.view"),
	"resellerShop",
);

export const ResellerCharges: CollectionConfig = {
	slug: "reseller-charges",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["resellerShop", "type", "amount", "status"],
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
		{ fields: ["resellerShop", "status"] },
		{ fields: ["purchaseOrder", "type"] },
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
			index: true,
		},
		{
			name: "purchaseOrder",
			type: "relationship",
			relationTo: "purchase-orders",
		},
		{
			name: "type",
			type: "select",
			required: true,
			options: options(["cod_refusal_delivery_cost", "clawback"]),
		},
		{
			name: "amount",
			type: "number",
			required: true,
			min: 1,
			access: { read: resellerMoneyRead },
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "open",
			options: options(["open", "offset", "overdue", "paid", "waived"]),
		},
		{
			name: "offsetBy",
			type: "relationship",
			relationTo: "reseller-payouts",
		},
		{
			name: "paymentIntents",
			type: "relationship",
			relationTo: "payment-intents",
			hasMany: true,
		},
		{
			name: "waivedBy",
			type: "relationship",
			relationTo: "users",
			access: { read: staffOnlyField },
		},
		{
			name: "waivedNote",
			type: "textarea",
			access: { read: staffOnlyField },
		},
	],
	timestamps: true,
};
