import type { CollectionConfig } from "payload";
import { nobody, staffOnly } from "../access/staff";

export const PAYOUT_HOLD_SCOPES = ["shop", "order"] as const;

export const PAYOUT_HOLD_REASONS = [
	"payout_account_changed",
	"fraud_signal",
	"reconciliation_mismatch",
	"dispute_open",
	"return_open",
	"moderation",
	"payout_failed_repeatedly",
	"shop_suspended",
] as const;
export type PayoutHoldReason = (typeof PAYOUT_HOLD_REASONS)[number];

/** Reasons whose hold also refuses new protected checkouts for the shop. */
export const CHARGE_BLOCKING_HOLD_REASONS: readonly PayoutHoldReason[] = [
	"fraud_signal",
	"moderation",
	"shop_suspended",
];

export const PAYOUT_HOLD_STATUSES = ["active", "released", "expired"] as const;

export const PAYOUT_HOLD_CREATORS = ["system", "moderator"] as const;

const options = (values: readonly string[]) =>
	values.map((value) => ({ label: value, value }));

/**
 * Staff-only on REST: a seller learns of a hold through the payments setup
 * route, which names its category and never the fraud rule behind it.
 */
export const PayoutHolds: CollectionConfig = {
	slug: "payout-holds",
	admin: {
		useAsTitle: "reason",
		defaultColumns: ["shop", "scope", "reason", "status", "until"],
	},
	access: {
		read: staffOnly,
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	fields: [
		{
			type: "row",
			fields: [
				{
					name: "scope",
					type: "select",
					required: true,
					options: options(PAYOUT_HOLD_SCOPES),
					admin: { width: "33%" },
				},
				{
					name: "shop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
				{
					name: "order",
					type: "relationship",
					relationTo: "orders",
					index: true,
					validate: (
						value: unknown,
						{ siblingData }: { siblingData: unknown },
					) =>
						(siblingData as { scope?: unknown }).scope !== "order" ||
						Boolean(value) ||
						"An order hold must name its order.",
					admin: { width: "34%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "reason",
					type: "select",
					required: true,
					options: options(PAYOUT_HOLD_REASONS),
					admin: { width: "50%" },
				},
				{
					name: "blocksCharges",
					type: "checkbox",
					defaultValue: false,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "status",
					type: "select",
					required: true,
					defaultValue: "active",
					index: true,
					options: options(PAYOUT_HOLD_STATUSES),
					admin: { width: "50%" },
				},
				// Null means the hold lasts until someone releases it.
				{ name: "until", type: "date", index: true, admin: { width: "50%" } },
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "createdByType",
					type: "select",
					required: true,
					options: options(PAYOUT_HOLD_CREATORS),
					admin: { width: "50%" },
				},
				{
					name: "createdBy",
					type: "relationship",
					relationTo: "users",
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "releasedBy",
					type: "relationship",
					relationTo: "users",
					admin: { width: "33%" },
				},
				{ name: "releasedAt", type: "date", admin: { width: "33%" } },
				{ name: "note", type: "text", admin: { width: "34%" } },
			],
		},
	],
	timestamps: true,
};
