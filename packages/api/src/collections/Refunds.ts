import type { Access, CollectionConfig } from "payload";
import { can, shopScopedRead } from "../access/shopRoles";
import { nobody } from "../access/staff";
import type { NormalisedRefundStatus } from "../lib/payments/marketplace";

export const REFUND_REASONS = [
	"order_cancelled",
	"seller_declined",
	"acceptance_timeout",
	"late_payment",
	"duplicate_payment",
	"withdrawal",
	"dispute",
	"unavailable",
	"moderation",
] as const;

export const REFUND_SOURCE_TYPES = [
	"order",
	"return-case",
	"dispute",
	"payment-intent",
	"moderation",
] as const;

/** `created` is local only: a row is `created` before it ever reaches the provider. */
export const REFUND_STATUSES = [
	"created",
	"pending",
	"processing",
	"succeeded",
	"failed",
] as const satisfies readonly ("created" | NormalisedRefundStatus)[];

export const REFUND_FUNDED_BY = [
	"connected_account",
	"platform_advance",
] as const;

/** Who moved a money row's status; P0's intent sources without `callback`. */
export const MONEY_STATUS_SOURCES = ["webhook", "reconcile", "system"] as const;

const options = (values: readonly string[]) =>
	values.map((value) => ({ label: value, value }));

const isWholePositive = (value: unknown): boolean =>
	typeof value === "number" && Number.isInteger(value) && value > 0;

/** The four breakdown parts must add up to the refunded amount. */
export function refundBreakdownProblem(
	amount: unknown,
	breakdown: unknown,
): string | null {
	if (!isWholePositive(amount)) {
		return "A refund amount is a whole number above zero.";
	}
	if (!breakdown || typeof breakdown !== "object") return null;
	const parts = ["seller", "commission", "commissionVat", "buyerProtectionFee"]
		.map((key) => (breakdown as Record<string, unknown>)[key])
		.filter((part) => part !== undefined && part !== null);
	if (parts.length === 0) return null;
	if (!parts.every((part) => Number.isInteger(part) && Number(part) >= 0)) {
		return "Breakdown parts are whole numbers, zero or more.";
	}
	const sum = parts.reduce<number>((total, part) => total + Number(part), 0);
	return sum === amount
		? null
		: `The breakdown adds up to ${sum}, not the refunded ${amount}.`;
}

/**
 * `buyer` and `shop` are denormalised from the order so read access can be a
 * plain `Where`: the buyer and the shop's owner/manager read their own rows.
 */
const buyerOwnRows: Access = ({ req: { user } }) =>
	user ? { buyer: { equals: user.id } } : false;

export const Refunds: CollectionConfig = {
	slug: "refunds",
	admin: {
		useAsTitle: "idempotencyKey",
		defaultColumns: ["order", "amount", "reason", "status", "createdAt"],
	},
	access: {
		read: shopScopedRead(buyerOwnRows, "shop", (role) =>
			can(role, "payments.view"),
		),
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	fields: [
		{
			name: "order",
			type: "relationship",
			relationTo: "orders",
			required: true,
			index: true,
		},
		{
			name: "paymentIntent",
			type: "relationship",
			relationTo: "payment-intents",
			required: true,
		},
		{ name: "buyer", type: "relationship", relationTo: "users", index: true },
		{ name: "shop", type: "relationship", relationTo: "shops", index: true },
		{
			name: "amount",
			type: "number",
			required: true,
			validate: (value: unknown, { siblingData }: { siblingData: unknown }) =>
				refundBreakdownProblem(
					value,
					(siblingData as { breakdown?: unknown }).breakdown,
				) ?? true,
		},
		{
			name: "breakdown",
			type: "group",
			fields: [
				{ name: "seller", type: "number" },
				{ name: "commission", type: "number" },
				{ name: "commissionVat", type: "number" },
				{ name: "buyerProtectionFee", type: "number" },
			],
		},
		{
			name: "reason",
			type: "select",
			required: true,
			options: options(REFUND_REASONS),
		},
		{
			name: "sourceType",
			type: "select",
			required: true,
			options: options(REFUND_SOURCE_TYPES),
		},
		{ name: "sourceId", type: "text", required: true, index: true },
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "created",
			index: true,
			options: options(REFUND_STATUSES),
		},
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{
					name: "status",
					type: "select",
					required: true,
					options: options(REFUND_STATUSES),
				},
				{
					name: "source",
					type: "select",
					required: true,
					options: options(MONEY_STATUS_SOURCES),
				},
				{ name: "at", type: "date", required: true },
			],
		},
		// Unique when set: Payload makes a non-required unique index sparse, so
		// the field must be left out, never written as null, until it is known.
		{ name: "providerRefundId", type: "text", unique: true },
		{
			name: "fundedBy",
			type: "select",
			defaultValue: "connected_account",
			options: options(REFUND_FUNDED_BY),
		},
		{ name: "idempotencyKey", type: "text", required: true, unique: true },
		{ name: "attempts", type: "number", defaultValue: 0 },
		// Set on the one automatic retry of a failed refund; its own failure goes to staff.
		{
			name: "retryOf",
			type: "relationship",
			relationTo: "refunds",
			index: true,
		},
		{ name: "lastError", type: "text" },
	],
	timestamps: true,
};
