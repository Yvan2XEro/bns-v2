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
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "name",
			type: "text",
			required: true,
		},
		{
			name: "query",
			type: "text",
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
			name: "alertEnabled",
			type: "checkbox",
			defaultValue: true,
			label: "Notify me of new listings",
		},
		{
			name: "lastCheckedAt",
			type: "date",
			admin: {
				readOnly: true,
			},
		},
	],
	timestamps: true,
};
