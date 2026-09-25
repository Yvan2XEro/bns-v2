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
		{
			// 24-hour bucket number. Stored so the unique index below can settle
			// two concurrent reveals; the service still decides what to write
			// from a rolling 24-hour lookup.
			name: "revealWindow",
			type: "number",
			required: true,
		},
	],
	indexes: [{ fields: ["viewer", "listing", "revealWindow"], unique: true }],
	timestamps: true,
};
