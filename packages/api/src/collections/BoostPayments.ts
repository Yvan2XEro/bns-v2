import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";

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
			const userWithRole = user as { role?: string };
			return userWithRole.role === "admin" || userWithRole.role === "moderator";
		},
		create: authenticated,
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
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
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
			options: [{ label: "NotchPay", value: "notchpay" }],
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
			name: "createdAt",
			type: "date",
			admin: {
				readOnly: true,
			},
		},
	],
	timestamps: true,
};
