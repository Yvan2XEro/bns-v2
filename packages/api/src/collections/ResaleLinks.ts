import type { Access, CollectionConfig, Where } from "payload";
import { isModerator } from "../access/roles";
import { memberShopIds } from "../access/shopRoles";
import { nobody } from "../access/staff";

const resaleLinkRead: Access = async ({ req }) => {
	if (isModerator(req.user)) return true;
	const shops = await memberShopIds(req);
	if (shops.length === 0) return false;
	const where: Where = {
		or: [{ supplierShop: { in: shops } }, { resellerShop: { in: shops } }],
	};
	return where;
};

const options = (values: readonly string[]) =>
	values.map((value) => ({ label: value, value }));

export const ResaleLinks: CollectionConfig = {
	slug: "resale-links",
	admin: {
		useAsTitle: "status",
		defaultColumns: ["supplierShop", "resellerShop", "status", "updatedAt"],
		group: "Resale",
	},
	access: {
		read: resaleLinkRead,
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	indexes: [{ fields: ["supplierShop", "resellerShop"], unique: true }],
	fields: [
		{
			name: "supplierShop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "resellerShop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "requested",
			options: options(["requested", "approved", "suspended", "revoked"]),
		},
		{ name: "requestedBy", type: "relationship", relationTo: "users" },
		{ name: "message", type: "textarea", maxLength: 500 },
		{ name: "resellerTermsVersion", type: "text" },
		{ name: "resellerTermsAcceptedAt", type: "date" },
		{ name: "decidedBy", type: "relationship", relationTo: "users" },
		{ name: "decidedAt", type: "date" },
		{
			name: "suspendedBy",
			type: "select",
			options: options(["supplier", "moderator", "system"]),
		},
		{
			name: "suspendedReason",
			type: "select",
			options: options([
				"quality",
				"pricing",
				"fraud_review",
				"terms",
				"other",
			]),
		},
		{ name: "note", type: "textarea" },
		{ name: "revokedAt", type: "date" },
		{
			name: "revokedBy",
			type: "select",
			options: options(["supplier", "moderator"]),
		},
		{ name: "riskHold", type: "checkbox", defaultValue: false },
		{
			name: "stats",
			type: "group",
			fields: [
				"publishedListings",
				"deliveredOrders30d",
				"cancelledPurchaseOrders30d",
				"refusedDeliveries30d",
			].map((name) => ({
				name,
				type: "number" as const,
				min: 0,
				defaultValue: 0,
			})),
		},
	],
	timestamps: true,
};
