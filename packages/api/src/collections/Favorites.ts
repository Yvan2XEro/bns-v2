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
			return {
				user: {
					equals: user.id,
				},
			};
		},
		create: authenticated,
		update: authenticated,
		delete: authenticated,
	},
	fields: [
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
			name: "listing",
			type: "relationship",
			relationTo: "listings",
			required: true,
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
