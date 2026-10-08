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
		{
			name: "buyer",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
		},
		{
			name: "items",
			type: "array",
			fields: [
				{
					name: "orderItem",
					type: "relationship",
					relationTo: "order-items",
					required: true,
				},
				{
					name: "variant",
					type: "relationship",
					relationTo: "product-variants",
				},
				{ name: "quantity", type: "number", min: 1 },
				{ name: "unitPrice", type: "number", min: 0 },
				{
					name: "buyerCondition",
					type: "select",
					options: ["unopened", "opened", "used", "damaged"].map((value) => ({
						label: value,
						value,
					})),
				},
				{
					name: "inspection",
					type: "group",
					fields: [
						{
							name: "outcome",
							type: "select",
							options: [
								"restock",
								"damaged_by_buyer",
								"damaged_in_transit",
								"not_matching",
								"missing",
							].map((value) => ({ label: value, value })),
						},
						{ name: "deductionAmount", type: "number", min: 0 },
						{ name: "note", type: "textarea", maxLength: 1000 },
					],
				},
			],
		},
		{ name: "reasonText", type: "textarea" },
		{
			name: "openedByType",
			type: "select",
			required: true,
			options: ["buyer", "seller", "system"].map((value) => ({
				label: value,
				value,
			})),
		},
		{ name: "openedBy", type: "relationship", relationTo: "users" },
		{
			name: "dispute",
			type: "relationship",
			relationTo: "disputes",
			index: true,
		},
		{ name: "returnRequired", type: "checkbox", defaultValue: true },
		{
			name: "returnMethod",
			type: "select",
			options: [
				{ label: "Buyer drop-off", value: "buyer_drop_off" },
				{ label: "Courier", value: "courier" },
				{ label: "Seller pickup", value: "seller_pickup" },
			],
		},
		{ name: "returnTracking", type: "text" },
		{
			name: "deadlines",
			type: "group",
			fields: [
				{ name: "requestDeadline", type: "date" },
				{ name: "shipBy", type: "date" },
				{ name: "pickupBy", type: "date" },
				{ name: "inspectBy", type: "date" },
				{ name: "deductionRespondBy", type: "date" },
				{ name: "refundBy", type: "date" },
				{
					name: "refundOverdueNotifiedAt",
					type: "date",
					admin: { hidden: true },
				},
			],
		},
		{ name: "shippedAt", type: "date" },
		{ name: "receivedAt", type: "date" },
		{ name: "inspectedAt", type: "date" },
		{ name: "closedAt", type: "date" },
		{
			name: "refund",
			type: "group",
			fields: [
				{ name: "amount", type: "number", min: 0 },
				{
					name: "breakdown",
					type: "group",
					fields: [
						{ name: "goods", type: "number", min: 0 },
						{ name: "outboundDelivery", type: "number", min: 0 },
						{ name: "returnShipping", type: "number", min: 0 },
						{ name: "buyerProtectionFee", type: "number", min: 0 },
						{ name: "deduction", type: "number", min: 0 },
					],
				},
				{
					name: "channel",
					type: "select",
					options: ["provider", "seller_direct"].map((value) => ({
						label: value,
						value,
					})),
				},
				{
					name: "providerRefund",
					type: "relationship",
					relationTo: "refunds",
				},
				{
					name: "sellerProof",
					type: "group",
					fields: [
						{
							name: "method",
							type: "select",
							options: ["cash", "mtn_momo", "orange_money"].map((value) => ({
								label: value,
								value,
							})),
						},
						{ name: "transactionId", type: "text" },
						{ name: "amount", type: "number", min: 0 },
						{
							name: "evidence",
							type: "relationship",
							relationTo: "dispute-evidence",
						},
						{ name: "submittedAt", type: "date" },
					],
				},
				{ name: "buyerConfirmedAt", type: "date" },
				{ name: "contestedAt", type: "date" },
			],
		},
		{
			name: "rejectionReason",
			type: "text",
			admin: { readOnly: true },
		},
		{
			name: "creditNote",
			type: "relationship",
			relationTo: "commission-invoices",
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
					options: ["buyer", "seller", "system", "moderator"].map((value) => ({
						label: value,
						value,
					})),
				},
				{ name: "actor", type: "relationship", relationTo: "users" },
				{ name: "at", type: "date" },
				{ name: "note", type: "text" },
			],
		},
	],
	timestamps: true,
};
