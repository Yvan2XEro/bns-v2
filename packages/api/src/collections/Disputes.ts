import type { CollectionConfig } from "payload";
import { DISPUTE_OUTCOMES, DISPUTE_REASONS } from "../contracts/disputes";
import { casePartyRead, serviceOnly } from "../access/caseRoles";

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
					name: "orderItem",
					type: "relationship",
					relationTo: "order-items",
					required: true,
				},
				{ name: "quantity", type: "number", required: true, min: 1 },
			],
		},
		{
			name: "returnCase",
			type: "relationship",
			relationTo: "return-cases",
			index: true,
		},
		{
			name: "reason",
			type: "select",
			required: true,
			options: options(DISPUTE_REASONS),
		},
		{
			name: "openedByType",
			type: "select",
			required: true,
			options: options(["buyer", "seller", "system"] as const),
		},
		{ name: "openedBy", type: "relationship", relationTo: "users" },
		{
			name: "description",
			type: "textarea",
			required: true,
			minLength: 20,
			maxLength: 2000,
		},
		{
			name: "requestedOutcome",
			type: "select",
			required: true,
			options: options(DISPUTE_OUTCOMES),
		},
		{ name: "requestedAmount", type: "number", min: 0 },
		{
			name: "paymentMethod",
			type: "select",
			required: true,
			options: options(["cod", "mobile_money"] as const),
		},
		{ name: "amountAtStake", type: "number", required: true, min: 0 },
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "open",
			index: true,
			admin: { readOnly: true },
			options: options(DISPUTE_STATUSES),
		},
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{ name: "status", type: "select", options: options(DISPUTE_STATUSES) },
				{
					name: "actorType",
					type: "select",
					options: options(DISPUTE_HISTORY_ACTORS),
				},
				{ name: "actor", type: "relationship", relationTo: "users" },
				date("at"),
				{ name: "note", type: "text" },
			],
		},
		{
			name: "deadlines",
			type: "group",
			fields: [
				date("submitBy"),
				date("respondBy"),
				date("reviewDueAt"),
				date("reminderSentAt"),
				date("reviewOverdueNotifiedAt"),
			],
		},
		{
			name: "proposal",
			type: "group",
			fields: [
				{ name: "amount", type: "number", min: 0 },
				{ name: "returnRequired", type: "checkbox" },
				{
					name: "byType",
					type: "select",
					options: options(DISPUTE_HISTORY_ACTORS),
				},
				{ name: "by", type: "relationship", relationTo: "users" },
				date("at"),
				date("expiresAt"),
				{ name: "round", type: "number", min: 1, max: 3 },
				{
					name: "status",
					type: "select",
					options: options(DISPUTE_PROPOSAL_STATUSES),
				},
			],
		},
		{ name: "infoRequests", type: "number", defaultValue: 0, min: 0 },
		{
			name: "assignedTo",
			type: "relationship",
			relationTo: "users",
			index: true,
		},
		{
			name: "resolution",
			type: "group",
			fields: [
				{ name: "outcome", type: "select", options: options(DISPUTE_STATUSES) },
				{ name: "refundAmount", type: "number", min: 0 },
				amountBreakdown,
				{ name: "returnRequired", type: "checkbox" },
				{
					name: "returnShippingPaidBy",
					type: "select",
					options: options(["seller", "buyer"] as const),
				},
				{
					name: "liableParty",
					type: "select",
					options: options(DISPUTE_LIABLE_PARTIES),
				},
				{
					name: "reasonCode",
					type: "select",
					options: options(DISPUTE_REASON_CODES),
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
					name: "decidedByType",
					type: "select",
					options: options(["system", "agreement", "moderator"] as const),
				},
				{ name: "decidedBy", type: "relationship", relationTo: "users" },
				date("decidedAt"),
			],
		},
		{
			name: "effects",
			type: "group",
			fields: [
				{
					name: "returnCase",
					type: "relationship",
					relationTo: "return-cases",
				},
				{ name: "refund", type: "relationship", relationTo: "refunds" },
				{
					name: "creditNote",
					type: "relationship",
					relationTo: "commission-invoices",
				},
				{ name: "holdsReleased", type: "checkbox" },
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
					name: "reviewAction",
					type: "select",
					options: options(["none", "published", "removed"] as const),
				},
				{
					name: "certificate",
					type: "relationship",
					relationTo: "dispute-evidence",
				},
			],
		},
		{
			name: "resale",
			type: "group",
			fields: [
				{ name: "supplierShop", type: "relationship", relationTo: "shops" },
				{ name: "resellerShop", type: "relationship", relationTo: "shops" },
				{ name: "purchaseOrder", type: "text" },
			],
		},
		{ name: "legalHold", type: "checkbox", defaultValue: false },
		date("lastMessageNotifiedAt"),
	],
	timestamps: true,
};
