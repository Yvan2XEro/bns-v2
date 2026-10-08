import type { CollectionConfig } from "payload";
import { can, shopScopedRead } from "../access/shopRoles";
import { staffOnly } from "../access/staff";

/**
 * `charge` and `carry_over` are written by P4, `credit` by P6. The spec names
 * one P8 kind (`resale_margin`, with a `reason` field P8 also adds); it is
 * declared here, reserved and unused, the same way P4 declares `order.paid`
 * on `order-events` without ever writing it.
 */
export const COMMISSION_LINE_KINDS = [
	"charge",
	"credit",
	"carry_over",
	"resale_margin",
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
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{ name: "order", type: "relationship", relationTo: "orders", index: true },
		{
			name: "kind",
			type: "select",
			required: true,
			index: true,
			options: COMMISSION_LINE_KINDS.map((value) => ({ label: value, value })),
		},
		{
			name: "paymentMethod",
			type: "select",
			options: [
				{ label: "Cash on delivery", value: "cod" },
				{ label: "Mobile money", value: "mobile_money" },
			],
		},
		{ name: "baseAmount", type: "number" },
		{ name: "amount", type: "number", required: true, min: 1 },
		{ name: "reason", type: "text" },
		{
			name: "status",
			type: "select",
			defaultValue: "open",
			index: true,
			options: COMMISSION_LINE_STATUSES.map((value) => ({
				label: value,
				value,
			})),
		},
		{
			name: "invoice",
			type: "relationship",
			relationTo: "commission-invoices",
		},
		{ name: "accruedAt", type: "date" },
	],
	timestamps: true,
};
