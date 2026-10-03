import type { CollectionConfig } from "payload";
import { can, shopScopedRead } from "../access/shopRoles";
import { nobody, staffOnly } from "../access/staff";
import type {
	ConnectedAccountStatus,
	PayoutSchedule,
} from "../lib/payments/marketplace";

export const CONNECTED_ACCOUNT_PROVIDERS = ["notchpay"] as const;

/**
 * `standard` is listed because the spec names it, and refused below: a
 * standard account lets the seller change the payout schedule and so defeat
 * release control. The port's `ConnectedAccountType` cannot express it at all.
 */
export const CONNECTED_ACCOUNT_TYPES = [
	"express",
	"custom",
	"standard",
] as const;

export const CONNECTED_ACCOUNT_STATUSES = [
	"created",
	"onboarding",
	"restricted",
	"active",
	"disabled",
	"deauthorized",
] as const satisfies readonly ConnectedAccountStatus[];

export const PAYOUT_SCHEDULES = [
	"manual",
	"daily",
	"weekly",
	"monthly",
] as const satisfies readonly PayoutSchedule[];

const options = (values: readonly string[]) =>
	values.map((value) => ({ label: value, value }));

/** One per shop per provider, mirroring the provider's connected account. */
export const ConnectedAccounts: CollectionConfig = {
	slug: "connected-accounts",
	admin: {
		useAsTitle: "providerAccountId",
		defaultColumns: ["shop", "provider", "status", "payoutSchedule"],
	},
	access: {
		read: shopScopedRead(staffOnly, "shop", (role) =>
			can(role, "payments.view"),
		),
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	indexes: [{ fields: ["shop", "provider"], unique: true }],
	fields: [
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "provider",
			type: "select",
			required: true,
			defaultValue: "notchpay",
			options: options(CONNECTED_ACCOUNT_PROVIDERS),
		},
		{ name: "providerAccountId", type: "text", unique: true },
		{
			name: "accountType",
			type: "select",
			required: true,
			defaultValue: "express",
			options: options(CONNECTED_ACCOUNT_TYPES),
			validate: (value: unknown) =>
				value !== "standard" ||
				"A standard account lets the seller change the payout schedule and defeat release control.",
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "created",
			index: true,
			options: options(CONNECTED_ACCOUNT_STATUSES),
		},
		{ name: "chargesEnabled", type: "checkbox", defaultValue: false },
		{ name: "payoutsEnabled", type: "checkbox", defaultValue: false },
		{ name: "requirementsDue", type: "json" },
		{ name: "kycStatus", type: "text" },
		{ name: "kycName", type: "text" },
		{
			name: "payoutSchedule",
			type: "select",
			options: options(PAYOUT_SCHEDULES),
		},
		{ name: "lastSyncedAt", type: "date" },
	],
	timestamps: true,
};
