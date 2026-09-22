import type { CollectionConfig } from "payload";
import { nobody } from "../access/staff";

export const BoostPayments: CollectionConfig = {
	slug: "boost-payments",
	admin: {
		useAsTitle: "id",
		defaultColumns: [
			"listing",
			"user",
			"amount",
			"duration",
			"status",
			"createdAt",
		],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return false;
			const userWithRole = user as { role?: string; id?: string };
			if (userWithRole.role === "admin" || userWithRole.role === "moderator") {
				return true;
			}
			return {
				user: {
					equals: userWithRole.id,
				},
			};
		},
		create: nobody,
		update: ({ req: { user } }) => {
			if (!user) return false;
			const userWithRole = user as { role?: string };
			return userWithRole.role === "admin" || userWithRole.role === "moderator";
		},
		delete: ({ req: { user } }) => {
			if (!user) return false;
			const userWithRole = user as { role?: string };
			return userWithRole.role === "admin";
		},
	},
	fields: [
		{
			name: "listing",
			type: "relationship",
			relationTo: "listings",
			required: true,
		},
		{
			// Nulled when the customer deletes their account; the record is kept.
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: false,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "amount",
			type: "number",
			required: true,
		},
		{
			name: "duration",
			type: "select",
			required: true,
			options: [
				{ label: "7 days", value: "7" },
				{ label: "14 days", value: "14" },
				{ label: "30 days", value: "30" },
			],
		},
		{
			name: "status",
			type: "select",
			options: [
				{ label: "Pending", value: "pending" },
				{ label: "Completed", value: "completed" },
				{ label: "Failed", value: "failed" },
				{ label: "Refunded", value: "refunded" },
			],
			defaultValue: "pending",
			required: true,
		},
		{
			name: "paymentProvider",
			type: "select",
			options: [
				{ label: "NotchPay", value: "notchpay" },
				{ label: "Stripe (Apple Pay)", value: "stripe" },
			],
			required: true,
		},
		{
			name: "paymentReference",
			type: "text",
		},
		{
			name: "paymentUrl",
			type: "text",
		},
		{
			name: "paymentIntent",
			type: "relationship",
			relationTo: "payment-intents",
			admin: { readOnly: true },
		},
		{
			name: "customerDeletedAt",
			type: "date",
			admin: { readOnly: true },
		},
		{
			name: "createdAt",
			type: "date",
			admin: {
				readOnly: true,
			},
		},
	],
	timestamps: true,
};
