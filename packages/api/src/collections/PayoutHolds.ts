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
			name: "scope",
			type: "select",
			required: true,
			options: options(PAYOUT_HOLD_SCOPES),
		},
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "order",
			type: "relationship",
			relationTo: "orders",
			index: true,
			validate: (value: unknown, { siblingData }: { siblingData: unknown }) =>
				(siblingData as { scope?: unknown }).scope !== "order" ||
				Boolean(value) ||
				"An order hold must name its order.",
		},
		{
			name: "reason",
			type: "select",
			required: true,
			options: options(PAYOUT_HOLD_REASONS),
		},
		{ name: "blocksCharges", type: "checkbox", defaultValue: false },
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "active",
			index: true,
			options: options(PAYOUT_HOLD_STATUSES),
		},
		// Null means the hold lasts until someone releases it.
		{ name: "until", type: "date", index: true },
		{
			name: "createdByType",
			type: "select",
			required: true,
			options: options(PAYOUT_HOLD_CREATORS),
		},
		{ name: "createdBy", type: "relationship", relationTo: "users" },
		{ name: "releasedBy", type: "relationship", relationTo: "users" },
		{ name: "releasedAt", type: "date" },
		{ name: "note", type: "text" },
	],
	timestamps: true,
};
