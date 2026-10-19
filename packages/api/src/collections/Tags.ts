import type { CollectionConfig } from "payload";

export const Tags: CollectionConfig = {
	slug: "tags",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "slug", "emoji", "categories"],
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
			type: "row",
			fields: [
				{
					name: "name",
					type: "text",
					required: true,
					// Shown to buyers and sellers in their language: switch the
					// admin's locale to write the English. Missing English falls
					// back to the French.
					localized: true,
					admin: { width: "50%" },
				},
				{
					name: "slug",
					type: "text",
					required: true,
					unique: true,
					index: true,
					admin: {
						width: "50%",
						description:
							"URL-safe identifier (e.g. negotiable, delivery, urgent)",
					},
				},
			],
		},
		{
			name: "emoji",
			type: "text",
			admin: {
				description: "Optional emoji to display with the tag (e.g. 🤝)",
			},
		},
		{
			name: "categories",
			type: "relationship",
			relationTo: "categories",
			hasMany: true,
			index: true,
			admin: {
				description:
					"Categories this tag is offered in. A category also gets the tags of every category above it, so pick the highest one where the tag still makes sense. A tag with no category is offered nowhere.",
			},
		},
	],
	timestamps: true,
};
