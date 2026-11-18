import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";

export const SavedSearches: CollectionConfig = {
	slug: "saved-searches",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "user", "query", "createdAt"],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return false;
			const u = user as { role?: string };
			if (u.role === "admin") return true;
			return {
				user: {
					equals: user.id,
				},
			};
		},
		create: authenticated,
		update: ({ req: { user } }) => {
			if (!user) return false;
			const u = user as { role?: string };
			if (u.role === "admin") return true;
			return { user: { equals: user.id } };
		},
		delete: ({ req: { user } }) => {
			if (!user) return false;
			const u = user as { role?: string };
			if (u.role === "admin") return true;
			return { user: { equals: user.id } };
		},
	},
	hooks: {
		beforeChange: [
			async ({ data, req, operation }) => {
				if (operation === "create" && req.user) {
					data.user = req.user.id;
				}
				return data;
			},
		],
	},
	fields: [
		{
			type: "row",
			fields: [
				{
					name: "user",
					type: "relationship",
					relationTo: "users",
					required: true,
					index: true,
					admin: { width: "33%", readOnly: true },
				},
				{
					name: "name",
					type: "text",
					required: true,
					admin: { width: "33%" },
				},
				{
					name: "query",
					type: "text",
					admin: { width: "33%" },
				},
			],
		},
		{
			name: "filters",
			type: "json",
		},
		{
			name: "url",
			type: "text",
			required: true,
		},
		{
			type: "row",
			fields: [
				{
					name: "alertEnabled",
					type: "checkbox",
					defaultValue: true,
					label: "Notify me of new listings",
					admin: { width: "50%" },
				},
				{
					name: "lastCheckedAt",
					type: "date",
					admin: { width: "50%", readOnly: true },
				},
			],
		},
	],
	timestamps: true,
};
