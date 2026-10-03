import type { CollectionConfig } from "payload";
import { nobody, staffOnly } from "../access/staff";

export const RECONCILIATION_RUN_STATUSES = [
	"running",
	"succeeded",
	"failed",
] as const;

export const ReconciliationRuns: CollectionConfig = {
	slug: "reconciliation-runs",
	admin: {
		useAsTitle: "startedAt",
		defaultColumns: ["startedAt", "finishedAt", "status"],
	},
	access: {
		read: staffOnly,
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	fields: [
		{ name: "startedAt", type: "date", required: true, index: true },
		{ name: "finishedAt", type: "date" },
		{
			name: "window",
			type: "group",
			fields: [
				{ name: "from", type: "date" },
				{ name: "to", type: "date" },
			],
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "running",
			index: true,
			options: RECONCILIATION_RUN_STATUSES.map((value) => ({
				label: value,
				value,
			})),
		},
		{
			name: "counts",
			type: "group",
			fields: [
				{ name: "checked", type: "number", defaultValue: 0 },
				{ name: "matched", type: "number", defaultValue: 0 },
				{ name: "autoFixed", type: "number", defaultValue: 0 },
				{ name: "mismatches", type: "number", defaultValue: 0 },
			],
		},
		{ name: "error", type: "text" },
	],
	timestamps: true,
};
