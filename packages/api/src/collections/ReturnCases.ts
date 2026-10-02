import type { CollectionConfig, Where } from "payload";
import { isModerator } from "../access/roles";
import { memberShopIds } from "../access/shopRoles";
import { relationId } from "../lib/relationId";

export const RETURN_CASE_BASES = [
	"withdrawal",
	"non_conformity",
	"late_delivery",
	"unavailable",
] as const;

/**
 * P6's full state machine (`services/returns.ts`), named here so the stored
 * value is never narrower than what P6 will write. P4 only ever creates a
 * case in `requested` — every transition after that, and every field beyond
 * what P4 needs for the hand-off (deadlines, inspection, refund, evidence),
 * belongs to P6.
 */
export const RETURN_CASE_STATUSES = [
	"requested",
	"approved",
	"rejected",
	"cancelled",
	"awaiting_shipment",
	"in_transit",
	"received",
	"inspected",
	"disputed",
	"refund_pending",
	"refunded",
	"closed",
	"expired",
] as const;

export const RETURN_CASES: CollectionConfig["slug"] = "return-cases";

export const ReturnCases: CollectionConfig = {
	slug: RETURN_CASES,
	admin: {
		useAsTitle: "number",
		defaultColumns: ["number", "order", "basis", "status", "createdAt"],
	},
	access: {
		// P6's own rule, implemented now rather than reworked later: the buyer,
		// an active member of the shop, and staff; nobody else.
		read: async ({ req }) => {
			if (isModerator(req.user)) return true;
			const userId = relationId(req.user);
			if (!userId) return false;
			const shops = await memberShopIds(req);
			const clauses: Where[] = [{ buyer: { equals: userId } }];
			if (shops.length > 0) clauses.push({ shop: { in: shops } });
			return { or: clauses } as Where;
		},
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{ name: "number", type: "text", required: true, unique: true, index: true },
		{
			name: "basis",
			type: "select",
			required: true,
			options: RETURN_CASE_BASES.map((value) => ({ label: value, value })),
		},
		{
			name: "order",
			type: "relationship",
			relationTo: "orders",
			required: true,
			index: true,
		},
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{ name: "buyer", type: "relationship", relationTo: "users", index: true },
		{
			name: "items",
			type: "array",
			fields: [
				{ name: "orderItem", type: "relationship", relationTo: "order-items" },
				{
					name: "variant",
					type: "relationship",
					relationTo: "product-variants",
				},
				{ name: "quantity", type: "number" },
			],
		},
		{ name: "reasonText", type: "textarea" },
		{
			name: "returnMethod",
			type: "select",
			options: [
				{ label: "Buyer drop-off", value: "buyer_drop_off" },
				{ label: "Courier", value: "courier" },
				{ label: "Seller pickup", value: "seller_pickup" },
			],
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "requested",
			index: true,
			options: RETURN_CASE_STATUSES.map((value) => ({ label: value, value })),
			admin: { readOnly: true },
		},
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{
					name: "status",
					type: "select",
					options: RETURN_CASE_STATUSES.map((value) => ({
						label: value,
						value,
					})),
				},
				{
					name: "actorType",
					type: "select",
					options: [
						{ label: "Buyer", value: "buyer" },
						{ label: "Seller", value: "seller" },
						{ label: "Staff", value: "staff" },
						{ label: "System", value: "system" },
					],
				},
				{ name: "actor", type: "relationship", relationTo: "users" },
				{ name: "at", type: "date" },
				{ name: "note", type: "text" },
			],
		},
	],
	timestamps: true,
};
