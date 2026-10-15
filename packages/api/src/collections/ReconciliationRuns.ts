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
		{
			type: "row",
			fields: [
				{
					name: "startedAt",
					type: "date",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
				{ name: "finishedAt", type: "date", admin: { width: "50%" } },
			],
		},
		{
			name: "window",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{ name: "from", type: "date", admin: { width: "50%" } },
						{ name: "to", type: "date", admin: { width: "50%" } },
					],
				},
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
				{
					type: "row",
					fields: [
						{
							name: "checked",
							type: "number",
							defaultValue: 0,
							admin: { width: "25%" },
						},
						{
							name: "matched",
							type: "number",
							defaultValue: 0,
							admin: { width: "25%" },
						},
						{
							name: "autoFixed",
							type: "number",
							defaultValue: 0,
							admin: { width: "25%" },
						},
						{
							name: "mismatches",
							type: "number",
							defaultValue: 0,
							admin: { width: "25%" },
						},
					],
				},
			],
		},
		{ name: "error", type: "text" },
	],
	timestamps: true,
};
