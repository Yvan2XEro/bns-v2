import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";

export const Favorites: CollectionConfig = {
	slug: "favorites",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["user", "listing", "createdAt"],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return false;
			const u = user as { role?: string };
			if (u.role === "admin" || u.role === "moderator") return true;
			return {
				user: {
					equals: user.id,
				},
			};
		},
		create: authenticated,
		update: authenticated,
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
					// Always set user from auth context (prevent spoofing)
					data.user = req.user.id;

					// Check for existing favorite to prevent duplicates
					const existing = await req.payload.find({
						collection: "favorites",
						where: {
							and: [
								{ user: { equals: req.user.id } },
								{ listing: { equals: data.listing } },
							],
						},
						limit: 1,
					});

					if (existing.docs.length > 0) {
						throw new Error("ALREADY_FAVORITED");
					}
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
			required: false,
			index: true,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "listing",
			type: "relationship",
			relationTo: "listings",
			required: true,
			index: true,
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
