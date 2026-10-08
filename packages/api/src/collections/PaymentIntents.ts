import type { CollectionConfig, FieldAccess } from "payload";
import { isModerator } from "../access/roles";
import { nobody } from "../access/staff";
import { CHANNEL_PHONE_PREFIXES } from "../lib/paymentMath";
import type { PaymentFailureCode } from "../lib/payments/marketplace";
import { relationId } from "../lib/relationId";

const STATUS_OPTIONS = [
	{ label: "Created", value: "created" },
	{ label: "Pending", value: "pending" },
	{ label: "Succeeded", value: "succeeded" },
	{ label: "Failed", value: "failed" },
	{ label: "Cancelled", value: "cancelled" },
	{ label: "Expired", value: "expired" },
];

export const PAYMENT_FAILURE_CODES = [
	"declined",
	"insufficient_funds",
	"timeout",
	"limit_exceeded",
	"invalid_number",
	"provider_error",
] as const satisfies readonly PaymentFailureCode[];

const isWholeAtLeastZero = (value: unknown) =>
	value === null ||
	value === undefined ||
	(typeof value === "number" && Number.isInteger(value) && value >= 0) ||
	"Must be a whole number in the currency's smallest unit";

/** The payer's number is the customer's and staff's, never a shop's. */
const customerOrStaffField: FieldAccess = ({ req: { user }, doc }) => {
	if (!user) return false;
	if (isModerator(user as { role?: string })) return true;
	return (
		relationId((doc as { customer?: unknown } | undefined)?.customer) ===
		String(user.id)
	);
};

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
				{ label: "Checkout", value: "checkout" },
				{ label: "Reseller charge", value: "reseller_charge" },
			],
		},
		{
			name: "targetType",
			type: "select",
			required: true,
			options: [
				{ label: "Boost payment", value: "boost-payment" },
				{ label: "Commission invoice", value: "commission-invoice" },
				{ label: "Order", value: "order" },
				{ label: "Reseller charge", value: "reseller-charge" },
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
		{
			name: "channel",
			type: "select",
			options: Object.keys(CHANNEL_PHONE_PREFIXES).map((value) => ({
				label: value,
				value,
			})),
		},
		{
			// Nulled by P0's account-deletion anonymisation with `customer`.
			name: "payerPhone",
			type: "text",
			access: { read: customerOrStaffField },
		},
		{
			name: "connectedAccount",
			type: "relationship",
			relationTo: "connected-accounts",
		},
		{
			name: "destinationAmount",
			type: "number",
			validate: isWholeAtLeastZero,
		},
		{ name: "applicationFee", type: "number", validate: isWholeAtLeastZero },
		{
			name: "attempt",
			type: "number",
			min: 1,
			max: 3,
			validate: (value: unknown) =>
				value === null ||
				value === undefined ||
				(typeof value === "number" &&
					Number.isInteger(value) &&
					value >= 1 &&
					value <= 3) ||
				"An intent is attempt 1, 2 or 3.",
		},
		{
			name: "failureCode",
			type: "select",
			options: PAYMENT_FAILURE_CODES.map((value) => ({ label: value, value })),
		},
		// A provider success on an intent already expired or cancelled: the
		// status stays terminal, the charge is posted, a refund follows.
		{ name: "lateSuccess", type: "checkbox", defaultValue: false },
	],
	timestamps: true,
};
