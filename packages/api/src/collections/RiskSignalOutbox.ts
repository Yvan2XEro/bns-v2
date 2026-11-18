import type { CollectionConfig } from "payload";
import { serviceOnly } from "../access/caseRoles";
import { staffOnly } from "../access/staff";

export const RISK_OUTBOX_SUBJECT_TYPES = ["shop", "user", "phone"] as const;
export const RISK_OUTBOX_SIGNALS = [
	"dispute_lost_seller",
	"counterfeit_confirmed",
	"refund_overdue",
	"seller_no_response",
	"unavailable_after_confirmation",
	"dispute_abuse_buyer",
	"cod_refusal_abuse",
	"serial_withdrawal",
	"evidence_reused",
	"review_extortion",
	"resale_collusion_suspected",
	"commission_credit_unpaid",
] as const;
export const RISK_OUTBOX_SEVERITIES = ["low", "medium", "high"] as const;
export const RISK_OUTBOX_SOURCES = ["dispute", "return-case"] as const;

export const RiskSignalOutbox: CollectionConfig = {
	slug: "risk-signal-outbox",
	admin: {
		useAsTitle: "signal",
		defaultColumns: [
			"subjectType",
			"signal",
			"severity",
			"occurredAt",
			"consumedAt",
		],
	},
	access: {
		read: staffOnly,
		create: serviceOnly,
		update: serviceOnly,
		delete: serviceOnly,
	},
	indexes: [
		{ fields: ["consumedAt", "occurredAt"] },
		{ fields: ["sourceType", "sourceId"] },
	],
	fields: [
		{
			type: "row",
			fields: [
				{
					name: "subjectType",
					type: "select",
					required: true,
					index: true,
					options: RISK_OUTBOX_SUBJECT_TYPES.map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "33%" },
				},
				{
					name: "subjectId",
					type: "text",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
				{
					name: "signal",
					type: "select",
					required: true,
					options: RISK_OUTBOX_SIGNALS.map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "33%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "severity",
					type: "select",
					required: true,
					options: RISK_OUTBOX_SEVERITIES.map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "33%" },
				},
				{
					name: "sourceType",
					type: "select",
					required: true,
					options: RISK_OUTBOX_SOURCES.map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "33%" },
				},
				{
					name: "sourceId",
					type: "text",
					required: true,
					admin: { width: "33%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "occurredAt",
					type: "date",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
				{
					name: "consumedAt",
					type: "date",
					index: true,
					admin: { width: "50%" },
				},
			],
		},
	],
	timestamps: true,
};
