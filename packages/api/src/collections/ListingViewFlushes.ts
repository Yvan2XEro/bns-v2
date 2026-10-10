import type { CollectionConfig } from "payload";
import { nobody } from "../access/staff";

export const ListingViewFlushes: CollectionConfig = {
	slug: "listing-view-flushes",
	admin: { hidden: true },
	access: {
		read: nobody,
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
		},
		{ name: "date", type: "text", required: true },
		{ name: "views", type: "number", required: true, min: 1 },
		{ name: "purgeAt", type: "date", required: true },
	],
	timestamps: true,
};
