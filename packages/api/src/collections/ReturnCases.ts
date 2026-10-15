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
		{
			type: "row",
			fields: [
				{
					name: "number",
					type: "text",
					required: true,
					unique: true,
					index: true,
					admin: { width: "50%" },
				},
				{
					name: "basis",
					type: "select",
					required: true,
					options: RETURN_CASE_BASES.map((value) => ({ label: value, value })),
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "order",
					type: "relationship",
					relationTo: "orders",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
				{
					name: "shop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
				{
					name: "buyer",
					type: "relationship",
					relationTo: "users",
					required: true,
					index: true,
					admin: { width: "34%" },
				},
			],
		},
		{
			name: "items",
			type: "array",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "orderItem",
							type: "relationship",
							relationTo: "order-items",
							required: true,
							admin: { width: "50%" },
						},
						{
							name: "variant",
							type: "relationship",
							relationTo: "product-variants",
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "quantity",
							type: "number",
							min: 1,
							admin: { width: "33%" },
						},
						{
							name: "unitPrice",
							type: "number",
							min: 0,
							admin: { width: "33%" },
						},
						{
							name: "buyerCondition",
							type: "select",
							options: ["unopened", "opened", "used", "damaged"].map(
								(value) => ({
									label: value,
									value,
								}),
							),
							admin: { width: "34%" },
						},
					],
				},
				{
					name: "inspection",
					type: "group",
					fields: [
						{
							type: "row",
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
									admin: { width: "50%" },
								},
								{
									name: "deductionAmount",
									type: "number",
									min: 0,
									admin: { width: "50%" },
								},
							],
						},
						{ name: "note", type: "textarea", maxLength: 1000 },
					],
				},
			],
		},
		{ name: "reasonText", type: "textarea" },
		{
			type: "row",
			fields: [
				{
					name: "openedByType",
					type: "select",
					required: true,
					options: ["buyer", "seller", "system"].map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "33%" },
				},
				{
					name: "openedBy",
					type: "relationship",
					relationTo: "users",
					admin: { width: "33%" },
				},
				{
					name: "dispute",
					type: "relationship",
					relationTo: "disputes",
					index: true,
					admin: { width: "34%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "returnRequired",
					type: "checkbox",
					defaultValue: true,
					admin: { width: "33%" },
				},
				{
					name: "returnMethod",
					type: "select",
					options: [
						{ label: "Buyer drop-off", value: "buyer_drop_off" },
						{ label: "Courier", value: "courier" },
						{ label: "Seller pickup", value: "seller_pickup" },
					],
					admin: { width: "33%" },
				},
				{ name: "returnTracking", type: "text", admin: { width: "34%" } },
			],
		},
		{
			name: "deadlines",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{ name: "requestDeadline", type: "date", admin: { width: "50%" } },
						{ name: "shipBy", type: "date", admin: { width: "50%" } },
					],
				},
				{
					type: "row",
					fields: [
						{ name: "pickupBy", type: "date", admin: { width: "50%" } },
						{ name: "inspectBy", type: "date", admin: { width: "50%" } },
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "deductionRespondBy",
							type: "date",
							admin: { width: "50%" },
						},
						{ name: "refundBy", type: "date", admin: { width: "50%" } },
					],
				},
				{
					name: "refundOverdueNotifiedAt",
					type: "date",
					admin: { hidden: true },
				},
				{
					name: "refundOverdueEscalatedAt",
					type: "date",
					admin: { hidden: true },
				},
			],
		},
		{
			type: "row",
			fields: [
				{ name: "shippedAt", type: "date", admin: { width: "25%" } },
				{ name: "receivedAt", type: "date", admin: { width: "25%" } },
				{ name: "inspectedAt", type: "date", admin: { width: "25%" } },
				{ name: "closedAt", type: "date", admin: { width: "25%" } },
			],
		},
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
					type: "row",
					fields: [
						{
							name: "channel",
							type: "select",
							options: ["provider", "seller_direct"].map((value) => ({
								label: value,
								value,
							})),
							admin: { width: "50%" },
						},
						{
							name: "providerRefund",
							type: "relationship",
							relationTo: "refunds",
							admin: { width: "50%" },
						},
					],
				},
				{
					name: "sellerProof",
					type: "group",
					fields: [
						{
							type: "row",
							fields: [
								{
									name: "method",
									type: "select",
									options: ["cash", "mtn_momo", "orange_money"].map(
										(value) => ({
											label: value,
											value,
										}),
									),
									admin: { width: "33%" },
								},
								{
									name: "transactionId",
									type: "text",
									admin: { width: "33%" },
								},
								{
									name: "amount",
									type: "number",
									min: 0,
									admin: { width: "34%" },
								},
							],
						},
						{
							type: "row",
							fields: [
								{
									name: "evidence",
									type: "relationship",
									relationTo: "dispute-evidence",
									admin: { width: "50%" },
								},
								{ name: "submittedAt", type: "date", admin: { width: "50%" } },
							],
						},
					],
				},
				{
					type: "row",
					fields: [
						{ name: "buyerConfirmedAt", type: "date", admin: { width: "50%" } },
						{ name: "contestedAt", type: "date", admin: { width: "50%" } },
					],
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "rejectionReason",
					type: "text",
					admin: { width: "33%", readOnly: true },
				},
				{
					name: "creditNote",
					type: "relationship",
					relationTo: "commission-invoices",
					admin: { width: "33%" },
				},
				{
					name: "status",
					type: "select",
					required: true,
					defaultValue: "requested",
					index: true,
					options: RETURN_CASE_STATUSES.map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "34%", readOnly: true },
				},
			],
		},
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "status",
							type: "select",
							options: RETURN_CASE_STATUSES.map((value) => ({
								label: value,
								value,
							})),
							admin: { width: "50%" },
						},
						{
							name: "actorType",
							type: "select",
							options: ["buyer", "seller", "system", "moderator"].map(
								(value) => ({
									label: value,
									value,
								}),
							),
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "actor",
							type: "relationship",
							relationTo: "users",
							admin: { width: "33%" },
						},
						{ name: "at", type: "date", admin: { width: "33%" } },
						{ name: "note", type: "text", admin: { width: "34%" } },
					],
				},
			],
		},
	],
	timestamps: true,
};
