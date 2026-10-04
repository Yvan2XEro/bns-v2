import type { CollectionConfig } from "payload";
import { casePartyRead, serviceOnly } from "../access/caseRoles";

export const SHOP_STRIKE_KINDS = [
	"dispute_lost",
	"refund_overdue",
	"counterfeit_confirmed",
	"no_response",
	"unavailable_after_confirmation",
	"review_extortion",
] as const;
export const SHOP_STRIKE_STATUSES = ["active", "expired", "revoked"] as const;

export const ShopStrikes: CollectionConfig = {
	slug: "shop-strikes",
	admin: {
		useAsTitle: "kind",
		defaultColumns: ["shop", "kind", "weight", "status", "expiresAt"],
	},
	access: {
		read: casePartyRead({ buyerField: "_neverBuyer", shopFields: ["shop"] }),
		create: serviceOnly,
		update: serviceOnly,
		delete: serviceOnly,
	},
	indexes: [{ fields: ["shop", "status", "expiresAt"] }],
	fields: [
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "kind",
			type: "select",
			required: true,
			options: SHOP_STRIKE_KINDS.map((value) => ({ label: value, value })),
		},
		{ name: "weight", type: "number", required: true, min: 1, max: 3 },
		{
			name: "sourceType",
			type: "select",
			required: true,
			options: ["dispute", "return-case"].map((value) => ({
				label: value,
				value,
			})),
		},
		{ name: "sourceId", type: "text", required: true, index: true },
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "active",
			options: SHOP_STRIKE_STATUSES.map((value) => ({ label: value, value })),
		},
		{ name: "expiresAt", type: "date", required: true, index: true },
		{ name: "revokedBy", type: "relationship", relationTo: "users" },
		{ name: "note", type: "textarea", maxLength: 1000 },
	],
	timestamps: true,
};
