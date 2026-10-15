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
			type: "row",
			fields: [
				{
					name: "listing",
					type: "relationship",
					relationTo: "listings",
					required: true,
					admin: { width: "25%" },
				},
				{ name: "date", type: "text", required: true, admin: { width: "25%" } },
				{
					name: "views",
					type: "number",
					required: true,
					min: 1,
					admin: { width: "25%" },
				},
				{
					name: "purgeAt",
					type: "date",
					required: true,
					admin: { width: "25%" },
				},
			],
		},
	],
	timestamps: true,
};
