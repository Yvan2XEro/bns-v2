import type { CollectionConfig } from "payload";
import { isModerator } from "../access/roles";
import { nobody } from "../access/staff";

/**
 * A buyer's saved delivery addresses. Read: the owner, and staff for support.
 * Writes go through `services/addresses.ts` only (limit, single default,
 * the shared address rules), so the REST surface accepts none.
 */
export const Addresses: CollectionConfig = {
	slug: "addresses",
	admin: {
		useAsTitle: "label",
		defaultColumns: ["label", "user", "city", "district", "isDefault"],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return false;
			if (isModerator(user as { role?: string })) return true;
			return { user: { equals: user.id } };
		},
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	fields: [
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
			admin: { readOnly: true },
		},
		{ name: "label", type: "text", maxLength: 30 },
		{ name: "recipientName", type: "text", required: true, maxLength: 60 },
		{ name: "phone", type: "text", required: true },
		{ name: "city", type: "text", required: true },
		{ name: "district", type: "text", required: true },
		{ name: "districtOther", type: "text", maxLength: 60 },
		{ name: "landmark", type: "text", maxLength: 200 },
		{ name: "instructions", type: "textarea", maxLength: 300 },
		{
			name: "gps",
			type: "group",
			fields: [
				{ name: "lat", type: "number" },
				{ name: "lng", type: "number" },
				{ name: "accuracyMeters", type: "number" },
			],
		},
		{ name: "isDefault", type: "checkbox", defaultValue: false },
	],
	timestamps: true,
};
