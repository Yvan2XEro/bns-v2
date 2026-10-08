import type { CollectionConfig } from "payload";
import { nobody, staffOnly } from "../access/staff";
import {
	RISK_AUTO_EFFECTS,
	RISK_RESOLUTIONS,
	RISK_SEVERITIES,
	RISK_SIGNALS,
	RISK_STATUSES,
	RISK_SUBJECT_TYPES,
} from "../types/riskModeration";

export { RISK_SIGNALS, RISK_SUBJECT_TYPES } from "../types/riskModeration";

const options = (values: readonly string[]) =>
	values.map((value) => ({ label: value, value }));

export const RiskFlags: CollectionConfig = {
	slug: "risk-flags",
	admin: {
		useAsTitle: "signal",
		defaultColumns: [
			"severity",
			"signal",
			"subjectType",
			"score",
			"status",
			"lastSeenAt",
		],
		group: "Moderation",
	},
	access: {
		read: staffOnly,
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	indexes: [
		{ fields: ["status", "severity", "score", "lastSeenAt"] },
		{ fields: ["purgeAt"] },
	],
	fields: [
		{
			name: "subjectType",
			type: "select",
			required: true,
			index: true,
			options: options(RISK_SUBJECT_TYPES),
		},
		{ name: "subjectKey", type: "text", required: true, index: true },
		{
			name: "subjectRef",
			type: "relationship",
			relationTo: ["users", "shops"],
		},
		{ name: "subjectLabel", type: "text" },
		{
			name: "signal",
			type: "select",
			required: true,
			index: true,
			options: options(RISK_SIGNALS),
		},
		{ name: "score", type: "number", required: true, min: 0, max: 100 },
		{
			name: "severity",
			type: "select",
			required: true,
			index: true,
			options: options(RISK_SEVERITIES),
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "open",
			index: true,
			options: options(RISK_STATUSES),
		},
		{ name: "evidence", type: "json", required: true },
		{ name: "occurrences", type: "number", min: 1, defaultValue: 1 },
		{ name: "firstSeenAt", type: "date", required: true },
		{ name: "lastSeenAt", type: "date", required: true },
		{
			name: "related",
			type: "relationship",
			relationTo: "risk-flags",
			hasMany: true,
		},
		{
			name: "autoEffects",
			type: "select",
			hasMany: true,
			options: options(RISK_AUTO_EFFECTS),
		},
		{ name: "assignedTo", type: "relationship", relationTo: "users" },
		{ name: "reviewedBy", type: "relationship", relationTo: "users" },
		{ name: "reviewedAt", type: "date" },
		{
			name: "resolution",
			type: "select",
			defaultValue: "none",
			options: options(RISK_RESOLUTIONS),
		},
		{ name: "resolutionNote", type: "textarea" },
		{ name: "purgeAt", type: "date", index: true },
	],
	timestamps: true,
};
