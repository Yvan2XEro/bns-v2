import type { CollectionConfig } from "payload";
import { can, shopScopedRead } from "../access/shopRoles";
import { staffOnly } from "../access/staff";

/**
 * `charge` and `carry_over` are written by P4, `credit` and `dispute_fee` by P6. The spec names
 * one P8 kind (`resale_margin`, with a `reason` field P8 also adds); it is
 * declared here, reserved and unused, the same way P4 declares `order.paid`
 * on `order-events` without ever writing it.
 */
export const COMMISSION_LINE_KINDS = [
	"charge",
	"credit",
	"carry_over",
	"resale_margin",
	"dispute_fee",
] as const;

export const COMMISSION_LINE_STATUSES = ["open", "invoiced", "waived"] as const;

/**
 * A "money collection": readable by a shop's owner/manager and staff, never
 * by a plain member — `shopScopedRead` with a `payments.view` predicate means
 * a staff membership resolves to no shop ids at all, so REST hands them
 * nothing rather than an empty-looking row.
 */
export const CommissionLines: CollectionConfig = {
	slug: "commission-lines",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["shop", "order", "kind", "amount", "status"],
	},
	access: {
		read: shopScopedRead(staffOnly, "shop", (role) =>
			can(role, "payments.view"),
		),
		create: () => false,
		update: () => false,
		delete: () => false,
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
					admin: { width: "50%" },
				},
				{
					name: "order",
					type: "relationship",
					relationTo: "orders",
					index: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "kind",
					type: "select",
					required: true,
					index: true,
					options: COMMISSION_LINE_KINDS.map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "50%" },
				},
				{
					name: "paymentMethod",
					type: "select",
					options: [
						{ label: "Cash on delivery", value: "cod" },
						{ label: "Mobile money", value: "mobile_money" },
					],
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{ name: "baseAmount", type: "number", admin: { width: "33%" } },
				{
					name: "amount",
					type: "number",
					required: true,
					min: 1,
					admin: { width: "33%" },
				},
				{ name: "reason", type: "text", admin: { width: "34%" } },
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "status",
					type: "select",
					defaultValue: "open",
					index: true,
					options: COMMISSION_LINE_STATUSES.map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "50%" },
				},
				{
					name: "invoice",
					type: "relationship",
					relationTo: "commission-invoices",
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{ name: "accruedAt", type: "date", admin: { width: "33%" } },
				{
					name: "sourceType",
					type: "select",
					options: ["dispute", "return-case"].map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "33%" },
				},
				{
					name: "sourceId",
					type: "text",
					index: true,
					admin: { width: "34%" },
				},
			],
		},
	],
	timestamps: true,
};
