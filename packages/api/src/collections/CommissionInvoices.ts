import type { CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";
import { can, shopScopedRead } from "../access/shopRoles";
import { staffOnly } from "../access/staff";
import { getOrderSettings } from "../lib/orderSettings";

export const COMMISSION_INVOICE_STATUSES = [
	"issued",
	"paid",
	"overdue",
	"waived",
	"void",
] as const;

/** Admin-only, from the Payload admin: staff.waiveInvoice is the one service writer. */
const adminOnlyUpdate = {
	update: ({ req }: { req: { user: { role?: string } | null } }) =>
		isAdmin(req.user),
};

export const CommissionInvoices: CollectionConfig = {
	slug: "commission-invoices",
	admin: {
		useAsTitle: "invoiceNumber",
		defaultColumns: ["invoiceNumber", "shop", "status", "totalDue", "dueAt"],
	},
	access: {
		read: shopScopedRead(staffOnly, "shop", (role) =>
			can(role, "payments.view"),
		),
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	hooks: {
		beforeChange: [
			async ({ data, operation, req }) => {
				if (operation !== "create") return data;
				if (data.vatRateBps == null) {
					const settings = await getOrderSettings(req.payload);
					data.vatRateBps = settings.vatRateBps;
				}
				return data;
			},
		],
	},
	fields: [
		{
			name: "invoiceNumber",
			type: "text",
			required: true,
			unique: true,
			index: true,
		},
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{ name: "periodStart", type: "date", index: true },
		{ name: "periodEnd", type: "date" },
		{
			name: "lines",
			type: "relationship",
			relationTo: "commission-lines",
			hasMany: true,
		},
		{ name: "ordersCount", type: "number" },
		{ name: "commissionTotal", type: "number" },
		{ name: "vatRateBps", type: "number" },
		{ name: "vatAmount", type: "number" },
		{ name: "totalDue", type: "number" },
		{ name: "currency", type: "text", defaultValue: "XAF" },
		{
			name: "status",
			type: "select",
			defaultValue: "issued",
			index: true,
			options: COMMISSION_INVOICE_STATUSES.map((value) => ({
				label: value,
				value,
			})),
		},
		{ name: "issuedAt", type: "date" },
		{ name: "dueAt", type: "date" },
		{ name: "paidAt", type: "date" },
		{ name: "restrictedAt", type: "date" },
		{
			name: "paymentIntents",
			type: "relationship",
			relationTo: "payment-intents",
			hasMany: true,
		},
		{ name: "sellerSnapshot", type: "json" },
		{ name: "issuerSnapshot", type: "json" },
		{
			name: "waivedBy",
			type: "relationship",
			relationTo: "users",
			access: adminOnlyUpdate,
		},
		{ name: "waivedNote", type: "text", access: adminOnlyUpdate },
	],
	timestamps: true,
};
