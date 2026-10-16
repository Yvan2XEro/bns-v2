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
			type: "row",
			fields: [
				{
					name: "supplierShop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
				{
					name: "resellerShop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "status",
					type: "select",
					required: true,
					defaultValue: "requested",
					options: options(["requested", "approved", "suspended", "revoked"]),
					admin: { width: "50%" },
				},
				{
					name: "requestedBy",
					type: "relationship",
					relationTo: "users",
					admin: { width: "50%" },
				},
			],
		},
		{ name: "message", type: "textarea", maxLength: 500 },
		{
			type: "row",
			fields: [
				{ name: "resellerTermsVersion", type: "text", admin: { width: "50%" } },
				{
					name: "resellerTermsAcceptedAt",
					type: "date",
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "decidedBy",
					type: "relationship",
					relationTo: "users",
					admin: { width: "50%" },
				},
				{ name: "decidedAt", type: "date", admin: { width: "50%" } },
			],
		},
		{
			name: "respondedAt",
			type: "date",
			admin: {
				readOnly: true,
				description:
					"When the supplier approved or declined the latest request; feeds the supplier's usual response time.",
			},
		},
		{
			type: "row",
			fields: [
				{
					name: "suspendedBy",
					type: "select",
					options: options(["supplier", "moderator", "system"]),
					admin: { width: "50%" },
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
					admin: { width: "50%" },
				},
			],
		},
		{ name: "note", type: "textarea" },
		{
			type: "row",
			fields: [
				{ name: "revokedAt", type: "date", admin: { width: "33%" } },
				{
					name: "revokedBy",
					type: "select",
					options: options(["supplier", "moderator", "reseller"]),
					admin: { width: "33%" },
				},
				{
					name: "riskHold",
					type: "checkbox",
					defaultValue: false,
					admin: { width: "33%" },
				},
			],
		},
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
