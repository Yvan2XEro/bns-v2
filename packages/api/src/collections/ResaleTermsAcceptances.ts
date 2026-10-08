import type { Access, CollectionConfig, Where } from "payload";
import { isModerator } from "../access/roles";
import { memberShopIds } from "../access/shopRoles";
import { nobody } from "../access/staff";

const acceptanceRead: Access = async ({ req }) => {
	if (isModerator(req.user)) return true;
	const shops = await memberShopIds(req, { permission: "resale.manage" });
	return shops.length > 0 ? ({ shop: { in: shops } } satisfies Where) : false;
};

export const ResaleTermsAcceptances: CollectionConfig = {
	slug: "resale-terms-acceptances",
	admin: { hidden: true },
	access: {
		read: acceptanceRead,
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	indexes: [
		{ fields: ["shop", "role", "version"], unique: true },
		{ fields: ["terms", "acceptedAt"] },
	],
	fields: [
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "role",
			type: "select",
			required: true,
			options: ["supplier", "reseller"].map((value) => ({
				label: value,
				value,
			})),
		},
		{
			name: "terms",
			type: "relationship",
			relationTo: "resale-terms",
			required: true,
		},
		{ name: "version", type: "text", required: true },
		{
			name: "acceptedBy",
			type: "relationship",
			relationTo: "users",
			required: true,
		},
		{ name: "acceptedAt", type: "date", required: true },
		{
			name: "locale",
			type: "select",
			required: true,
			options: ["fr", "en"].map((value) => ({ label: value, value })),
		},
		{
			name: "client",
			type: "select",
			required: true,
			options: ["web", "ios", "android"].map((value) => ({
				label: value,
				value,
			})),
		},
	],
	timestamps: true,
};
