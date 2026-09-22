import type { CollectionConfig } from "payload";
import { nobody, staffOnly } from "../access/staff";

/** Who asked for which seller's phone. Written only by services/contactReveal.ts. */
export const ContactReveals: CollectionConfig = {
	slug: "contact-reveals",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["listing", "seller", "viewer", "createdAt"],
	},
	access: {
		read: staffOnly,
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	fields: [
		{
			name: "listing",
			type: "relationship",
			relationTo: "listings",
			required: true,
			index: true,
		},
		{
			name: "seller",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
		},
		{
			name: "viewer",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
		},
	],
	timestamps: true,
};
