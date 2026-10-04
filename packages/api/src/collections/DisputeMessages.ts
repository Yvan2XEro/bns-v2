import type { CollectionConfig, Where } from "payload";
import { casePartyRead, serviceOnly } from "../access/caseRoles";

export const DISPUTE_MESSAGE_AUTHORS = [
	"buyer",
	"seller",
	"supplier",
	"moderator",
	"system",
] as const;
export const DISPUTE_MESSAGE_KINDS = [
	"message",
	"proposal",
	"proposal_response",
	"info_request",
	"decision",
	"system",
] as const;

export const DisputeMessages: CollectionConfig = {
	slug: "dispute-messages",
	admin: {
		useAsTitle: "createdAt",
		defaultColumns: ["dispute", "authorType", "kind", "createdAt"],
	},
	access: {
		read: casePartyRead({
			buyerField: "dispute.buyer",
			shopFields: ["dispute.shop", "dispute.resale.supplierShop"],
			constraints: [{ visibility: { equals: "parties" } } as Where],
		}),
		create: serviceOnly,
		update: serviceOnly,
		delete: serviceOnly,
	},
	fields: [
		{
			name: "dispute",
			type: "relationship",
			relationTo: "disputes",
			required: true,
			index: true,
		},
		{
			name: "authorType",
			type: "select",
			required: true,
			options: DISPUTE_MESSAGE_AUTHORS.map((value) => ({
				label: value,
				value,
			})),
		},
		{ name: "author", type: "relationship", relationTo: "users" },
		{
			name: "kind",
			type: "select",
			required: true,
			options: DISPUTE_MESSAGE_KINDS.map((value) => ({ label: value, value })),
		},
		{ name: "body", type: "textarea", maxLength: 2000 },
		{
			name: "evidence",
			type: "relationship",
			relationTo: "dispute-evidence",
			hasMany: true,
			maxRows: 5,
		},
		{
			name: "visibility",
			type: "select",
			required: true,
			defaultValue: "parties",
			options: ["parties", "staff"].map((value) => ({ label: value, value })),
		},
		{ name: "redactedAt", type: "date" },
		{ name: "redactedBy", type: "relationship", relationTo: "users" },
	],
	timestamps: true,
};
