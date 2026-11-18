import type { CollectionConfig } from "payload";
import { casePartyRead, serviceOnly } from "../access/caseRoles";
import { DISPUTE_OUTCOMES, DISPUTE_REASONS } from "../contracts/disputes";

export const DISPUTE_SUBJECTS = ["goods", "refund"] as const;
export const DISPUTE_STATUSES = [
	"open",
	"awaiting_seller",
	"awaiting_buyer",
	"under_review",
	"resolved_buyer",
	"resolved_seller",
	"resolved_split",
	"withdrawn",
] as const;
export { DISPUTE_OUTCOMES, DISPUTE_REASONS };
export const DISPUTE_REASON_CODES = [
	"seller_no_proof",
	"delivery_proven",
	"item_conforms",
	"item_not_conforming",
	"counterfeit_confirmed",
	"counterfeit_not_established",
	"damage_in_transit",
	"buyer_damage",
	"buyer_abuse",
	"review_extortion",
	"partial_fault",
	"agreement",
	"other",
] as const;
export const DISPUTE_LIABLE_PARTIES = [
	"seller",
	"supplier",
	"reseller",
	"courier",
	"buyer",
	"none",
] as const;
export const DISPUTE_HISTORY_ACTORS = [
	"buyer",
	"seller",
	"supplier",
	"moderator",
	"system",
] as const;
export const DISPUTE_PROPOSAL_STATUSES = [
	"open",
	"accepted",
	"rejected",
	"lapsed",
] as const;

const options = <T extends readonly string[]>(values: T) =>
	values.map((value) => ({ label: value, value }));
const date = (name: string) => ({ name, type: "date" as const });
const amountBreakdown = {
	name: "breakdown",
	type: "group" as const,
	fields: [
		{ name: "goods", type: "number" as const },
		{ name: "outboundDelivery", type: "number" as const },
		{ name: "returnShipping", type: "number" as const },
		{ name: "buyerProtectionFee", type: "number" as const },
		{ name: "deduction", type: "number" as const },
	],
};

export const Disputes: CollectionConfig = {
	slug: "disputes",
	admin: {
		useAsTitle: "number",
		defaultColumns: ["number", "order", "reason", "status", "createdAt"],
	},
	access: {
		read: casePartyRead({ shopFields: ["shop", "resale.supplierShop"] }),
		create: serviceOnly,
		update: serviceOnly,
		delete: serviceOnly,
	},
	indexes: [{ fields: ["order", "status"] }],
	fields: [
		{ name: "number", type: "text", required: true, unique: true, index: true },
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
			name: "subject",
			type: "select",
			required: true,
			options: options(DISPUTE_SUBJECTS),
		},
		{
			name: "items",
			type: "array",
			minRows: 1,
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
							name: "quantity",
							type: "number",
							required: true,
							min: 1,
							admin: { width: "50%" },
						},
					],
				},
			],
		},
		{
			name: "returnCase",
			type: "relationship",
			relationTo: "return-cases",
			index: true,
		},
		{
			type: "row",
			fields: [
				{
					name: "reason",
					type: "select",
					required: true,
					options: options(DISPUTE_REASONS),
					admin: { width: "33%" },
				},
				{
					name: "openedByType",
					type: "select",
					required: true,
					options: options(["buyer", "seller", "system"] as const),
					admin: { width: "33%" },
				},
				{
					name: "openedBy",
					type: "relationship",
					relationTo: "users",
					admin: { width: "34%" },
				},
			],
		},
		{
			name: "description",
			type: "textarea",
			required: true,
			minLength: 20,
			maxLength: 2000,
		},
		{
			type: "row",
			fields: [
				{
					name: "requestedOutcome",
					type: "select",
					required: true,
					options: options(DISPUTE_OUTCOMES),
					admin: { width: "33%" },
				},
				{
					name: "requestedAmount",
					type: "number",
					min: 0,
					admin: { width: "33%" },
				},
				{
					name: "paymentMethod",
					type: "select",
					required: true,
					options: options(["cod", "mobile_money"] as const),
					admin: { width: "34%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "amountAtStake",
					type: "number",
					required: true,
					min: 0,
					admin: { width: "50%" },
				},
				{
					name: "status",
					type: "select",
					required: true,
					defaultValue: "open",
					index: true,
					admin: { width: "50%", readOnly: true },
					options: options(DISPUTE_STATUSES),
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
							options: options(DISPUTE_STATUSES),
							admin: { width: "50%" },
						},
						{
							name: "actorType",
							type: "select",
							options: options(DISPUTE_HISTORY_ACTORS),
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
						{ ...date("at"), admin: { width: "33%" } },
						{ name: "note", type: "text", admin: { width: "34%" } },
					],
				},
			],
		},
		{
			name: "deadlines",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{ ...date("submitBy"), admin: { width: "50%" } },
						{ ...date("respondBy"), admin: { width: "50%" } },
					],
				},
				{
					type: "row",
					fields: [
						{ ...date("reviewDueAt"), admin: { width: "50%" } },
						{ ...date("reminderSentAt"), admin: { width: "50%" } },
					],
				},
				date("reviewOverdueNotifiedAt"),
			],
		},
		{
			name: "proposal",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{ name: "amount", type: "number", min: 0, admin: { width: "50%" } },
						{
							name: "returnRequired",
							type: "checkbox",
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "byType",
							type: "select",
							options: options(DISPUTE_HISTORY_ACTORS),
							admin: { width: "50%" },
						},
						{
							name: "by",
							type: "relationship",
							relationTo: "users",
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{ ...date("at"), admin: { width: "50%" } },
						{ ...date("expiresAt"), admin: { width: "50%" } },
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "round",
							type: "number",
							min: 1,
							max: 3,
							admin: { width: "50%" },
						},
						{
							name: "status",
							type: "select",
							options: options(DISPUTE_PROPOSAL_STATUSES),
							admin: { width: "50%" },
						},
					],
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "infoRequests",
					type: "number",
					defaultValue: 0,
					min: 0,
					admin: { width: "50%" },
				},
				{
					name: "assignedTo",
					type: "relationship",
					relationTo: "users",
					index: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			name: "resolution",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "outcome",
							type: "select",
							options: options(DISPUTE_STATUSES),
							admin: { width: "50%" },
						},
						{
							name: "refundAmount",
							type: "number",
							min: 0,
							admin: { width: "50%" },
						},
					],
				},
				amountBreakdown,
				{
					type: "row",
					fields: [
						{
							name: "returnRequired",
							type: "checkbox",
							admin: { width: "50%" },
						},
						{
							name: "returnShippingPaidBy",
							type: "select",
							options: options(["seller", "buyer"] as const),
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "liableParty",
							type: "select",
							options: options(DISPUTE_LIABLE_PARTIES),
							admin: { width: "50%" },
						},
						{
							name: "reasonCode",
							type: "select",
							options: options(DISPUTE_REASON_CODES),
							admin: { width: "50%" },
						},
					],
				},
				{
					name: "publicStatement",
					type: "group",
					fields: [
						{ name: "fr", type: "textarea" },
						{ name: "en", type: "textarea" },
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "decidedByType",
							type: "select",
							options: options(["system", "agreement", "moderator"] as const),
							admin: { width: "33%" },
						},
						{
							name: "decidedBy",
							type: "relationship",
							relationTo: "users",
							admin: { width: "33%" },
						},
						{ ...date("decidedAt"), admin: { width: "34%" } },
					],
				},
			],
		},
		{
			name: "effects",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "returnCase",
							type: "relationship",
							relationTo: "return-cases",
							admin: { width: "50%" },
						},
						{
							name: "refund",
							type: "relationship",
							relationTo: "refunds",
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "creditNote",
							type: "relationship",
							relationTo: "commission-invoices",
							admin: { width: "50%" },
						},
						{
							name: "holdsReleased",
							type: "checkbox",
							admin: { width: "50%" },
						},
					],
				},
				{
					name: "strikes",
					type: "relationship",
					relationTo: "shop-strikes",
					hasMany: true,
				},
				{
					name: "riskSignals",
					type: "relationship",
					relationTo: "risk-signal-outbox",
					hasMany: true,
				},
				{
					type: "row",
					fields: [
						{
							name: "reviewAction",
							type: "select",
							options: options(["none", "published", "removed"] as const),
							admin: { width: "50%" },
						},
						{
							name: "certificate",
							type: "relationship",
							relationTo: "dispute-evidence",
							admin: { width: "50%" },
						},
					],
				},
			],
		},
		{
			name: "resale",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "supplierShop",
							type: "relationship",
							relationTo: "shops",
							admin: { width: "33%" },
						},
						{
							name: "resellerShop",
							type: "relationship",
							relationTo: "shops",
							admin: { width: "33%" },
						},
						{ name: "purchaseOrder", type: "text", admin: { width: "34%" } },
					],
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "legalHold",
					type: "checkbox",
					defaultValue: false,
					admin: { width: "50%" },
				},
				{ ...date("lastMessageNotifiedAt"), admin: { width: "50%" } },
			],
		},
	],
	timestamps: true,
};
