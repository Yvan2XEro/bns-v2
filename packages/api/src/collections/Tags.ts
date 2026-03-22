import type { CollectionConfig } from "payload";

export const Tags: CollectionConfig = {
	slug: "tags",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "slug", "emoji"],
	},
	access: {
		read: () => true,
		create: ({ req: { user } }) => {
			const u = user as { role?: string } | undefined;
			return u?.role === "admin" || u?.role === "moderator";
		},
		update: ({ req: { user } }) => {
			const u = user as { role?: string } | undefined;
			return u?.role === "admin" || u?.role === "moderator";
		},
		delete: ({ req: { user } }) => {
			const u = user as { role?: string } | undefined;
			return u?.role === "admin";
		},
	},
	fields: [
		{
			name: "name",
			type: "text",
			required: true,
		},
		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
			index: true,
			admin: {
				description: "URL-safe identifier (e.g. negotiable, delivery, urgent)",
			},
		},
		{
			name: "emoji",
			type: "text",
			admin: {
				description: "Optional emoji to display with the tag (e.g. 🤝)",
			},
		},
	],
	timestamps: true,
};
