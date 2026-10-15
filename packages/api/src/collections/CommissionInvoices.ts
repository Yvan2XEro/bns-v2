import type { CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";
import { can, shopScopedRead } from "../access/shopRoles";
import { staffOnly } from "../access/staff";
import { getOrderSettings } from "../lib/orderSettings";
import { formatSnapshotField } from "./fields/formatSnapshot";

/**
 * `mobile_money`: P4's weekly invoice, which the seller pays. `application_fee`:
 * P5's per-order invoice for a protected order, issued already `paid` because
 * the commission was taken in the application fee.
 */
export const COMMISSION_INVOICE_SETTLEMENTS = [
	"mobile_money",
	"application_fee",
] as const;

export const COMMISSION_INVOICE_STATUSES = [
	"issued",
	"paid",
	"overdue",
	"waived",
	"void",
] as const;

export const COMMISSION_INVOICE_KINDS = ["invoice", "credit_note"] as const;

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
			type: "row",
			fields: [
				{
					name: "kind",
					type: "select",
					required: true,
					defaultValue: "invoice",
					options: COMMISSION_INVOICE_KINDS.map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "50%" },
				},
				{
					name: "creditsInvoice",
					type: "relationship",
					relationTo: "commission-invoices",
					index: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "sourceType",
					type: "select",
					options: ["dispute", "return-case"].map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "50%" },
				},
				{
					name: "sourceId",
					type: "text",
					index: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "invoiceNumber",
					type: "text",
					required: true,
					unique: true,
					index: true,
					admin: { width: "50%" },
				},
				{
					name: "shop",
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
					name: "periodStart",
					type: "date",
					index: true,
					admin: { width: "50%" },
				},
				{ name: "periodEnd", type: "date", admin: { width: "50%" } },
			],
		},
		{
			name: "lines",
			type: "relationship",
			relationTo: "commission-lines",
			hasMany: true,
		},
		{
			type: "row",
			fields: [
				{ name: "ordersCount", type: "number", admin: { width: "33%" } },
				{ name: "commissionTotal", type: "number", admin: { width: "33%" } },
				{ name: "vatRateBps", type: "number", admin: { width: "33%" } },
			],
		},
		{
			type: "row",
			fields: [
				{ name: "vatAmount", type: "number", admin: { width: "33%" } },
				{ name: "totalDue", type: "number", admin: { width: "33%" } },
				{
					name: "currency",
					type: "text",
					required: true,
					admin: { width: "33%" },
				},
			],
		},
		formatSnapshotField,
		{
			type: "row",
			fields: [
				{
					name: "status",
					type: "select",
					defaultValue: "issued",
					index: true,
					options: COMMISSION_INVOICE_STATUSES.map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "50%" },
				},
				{
					name: "settlement",
					type: "select",
					defaultValue: "mobile_money",
					index: true,
					options: COMMISSION_INVOICE_SETTLEMENTS.map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{ name: "issuedAt", type: "date", admin: { width: "33%" } },
				{ name: "dueAt", type: "date", admin: { width: "33%" } },
				{ name: "paidAt", type: "date", admin: { width: "33%" } },
			],
		},
		{
			type: "row",
			fields: [
				{ name: "restrictedAt", type: "date", admin: { width: "50%" } },
				// Makes the dueAt-2d reminder idempotent across daily enforcement runs:
				// without a marker, every run between the reminder point and dueAt would
				// re-send it. Added by Task 14 (services/commission.ts#enforceOverdue);
				// no other field here can carry this flag.
				{
					name: "dueSoonReminderSentAt",
					type: "date",
					admin: { width: "50%" },
				},
			],
		},
		{
			name: "paymentIntents",
			type: "relationship",
			relationTo: "payment-intents",
			hasMany: true,
		},
		{ name: "sellerSnapshot", type: "json" },
		{ name: "issuerSnapshot", type: "json" },
		{
			type: "row",
			fields: [
				{
					name: "waivedBy",
					type: "relationship",
					relationTo: "users",
					access: adminOnlyUpdate,
					admin: { width: "50%" },
				},
				{
					name: "waivedNote",
					type: "text",
					access: adminOnlyUpdate,
					admin: { width: "50%" },
				},
			],
		},
	],
	timestamps: true,
};
