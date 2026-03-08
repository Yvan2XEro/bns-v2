import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";

export const Reports: CollectionConfig = {
	slug: "reports",
	admin: {
		useAsTitle: "id",
		defaultColumns: [
			"reporter",
			"targetType",
			"targetId",
			"reason",
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
			name: "reporter",
			type: "relationship",
			relationTo: "users",
			required: true,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "targetType",
			type: "select",
			required: true,
			options: [
				{ label: "Listing", value: "listing" },
				{ label: "User", value: "user" },
				{ label: "Message", value: "message" },
			],
		},
		{
			name: "targetId",
			type: "text",
			required: true,
		},
		{
			name: "reason",
			type: "select",
			required: true,
			options: [
				{ label: "Spam", value: "spam" },
				{ label: "Inappropriate content", value: "inappropriate" },
				{ label: "Fraud", value: "fraud" },
				{ label: "Prohibited item", value: "prohibited" },
				{ label: "Harassment", value: "harassment" },
				{ label: "Other", value: "other" },
			],
		},
		{
			name: "description",
			type: "textarea",
		},
		{
			name: "status",
			type: "select",
			options: [
				{ label: "Pending", value: "pending" },
				{ label: "Reviewed", value: "reviewed" },
				{ label: "Resolved", value: "resolved" },
			],
			defaultValue: "pending",
			required: true,
		},
		{
			name: "resolution",
			type: "textarea",
			admin: {
				condition: (data) => data.status !== "pending",
			},
		},
		{
			name: "resolvedBy",
			type: "relationship",
			relationTo: "users",
			admin: {
				readOnly: true,
			},
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
