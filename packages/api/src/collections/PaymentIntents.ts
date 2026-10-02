import type { CollectionConfig } from "payload";
import { isModerator } from "../access/roles";
import { nobody } from "../access/staff";

const STATUS_OPTIONS = [
	{ label: "Created", value: "created" },
	{ label: "Pending", value: "pending" },
	{ label: "Succeeded", value: "succeeded" },
	{ label: "Failed", value: "failed" },
	{ label: "Cancelled", value: "cancelled" },
	{ label: "Expired", value: "expired" },
];

const PROVIDER_OPTIONS = [
	{ label: "NotchPay", value: "notchpay" },
	{ label: "Stripe", value: "stripe" },
];

/**
 * The single record of every attempt to move money. Only services/payments.ts
 * writes it, with overrideAccess; status changes go through its transition table.
 */
export const PaymentIntents: CollectionConfig = {
	slug: "payment-intents",
	admin: {
		useAsTitle: "reference",
		defaultColumns: [
			"reference",
			"purpose",
			"amount",
			"currency",
			"status",
			"createdAt",
		],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return false;
			if (isModerator(user as { role?: string })) return true;
			return { customer: { equals: user.id } };
		},
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	fields: [
		{
			name: "purpose",
			type: "select",
			required: true,
			options: [
				{ label: "Boost", value: "boost" },
				{ label: "Commission", value: "commission" },
			],
		},
		{
			name: "targetType",
			type: "select",
			required: true,
			options: [
				{ label: "Boost payment", value: "boost-payment" },
				{ label: "Commission invoice", value: "commission-invoice" },
			],
		},
		{ name: "targetId", type: "text", required: true, index: true },
		{
			name: "customer",
			type: "relationship",
			relationTo: "users",
			index: true,
		},
		{ name: "customerDeletedAt", type: "date" },
		{
			name: "amount",
			type: "number",
			required: true,
			validate: (value: unknown) =>
				(typeof value === "number" && Number.isInteger(value) && value >= 0) ||
				"Amount must be a whole number in the currency's smallest unit",
		},
		{ name: "currency", type: "text", required: true },
		{
			name: "provider",
			type: "select",
			required: true,
			options: PROVIDER_OPTIONS,
		},
		{ name: "providerReference", type: "text", index: true },
		{ name: "reference", type: "text", unique: true },
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "created",
			index: true,
			options: STATUS_OPTIONS,
		},
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{
					name: "status",
					type: "select",
					required: true,
					options: STATUS_OPTIONS,
				},
				{
					name: "source",
					type: "select",
					required: true,
					options: [
						{ label: "Webhook", value: "webhook" },
						{ label: "Callback", value: "callback" },
						{ label: "Reconciliation", value: "reconcile" },
						{ label: "System", value: "system" },
					],
				},
				{ name: "at", type: "date", required: true },
				{ name: "note", type: "text" },
			],
		},
		{ name: "idempotencyKey", type: "text", required: true, unique: true },
		{ name: "checkoutUrl", type: "text" },
		{ name: "expiresAt", type: "date", index: true },
		{ name: "settledAmount", type: "number" },
		{ name: "settledCurrency", type: "text" },
	],
	timestamps: true,
};
