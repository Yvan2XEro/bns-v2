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
			type: "row",
			fields: [
				{
					name: "shop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
				{
					name: "role",
					type: "select",
					required: true,
					options: ["supplier", "reseller"].map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "terms",
					type: "relationship",
					relationTo: "resale-terms",
					required: true,
					admin: { width: "50%" },
				},
				{
					name: "version",
					type: "text",
					required: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "acceptedBy",
					type: "relationship",
					relationTo: "users",
					required: true,
					admin: { width: "50%" },
				},
				{
					name: "acceptedAt",
					type: "date",
					required: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "locale",
					type: "select",
					required: true,
					options: ["fr", "en"].map((value) => ({ label: value, value })),
					admin: { width: "50%" },
				},
				{
					name: "client",
					type: "select",
					required: true,
					options: ["web", "ios", "android"].map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "50%" },
				},
			],
		},
	],
	timestamps: true,
};
