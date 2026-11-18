import type { Access, CollectionConfig, Where } from "payload";
import { isAdmin, isModerator } from "../access/roles";

const termsRead: Access = ({ req }) => {
	if (isModerator(req.user)) return true;
	return { publishedAt: { exists: true } } satisfies Where;
};

const administratorOnly: Access = ({ req }) => isAdmin(req.user);

export const ResaleTerms: CollectionConfig = {
	slug: "resale-terms",
	admin: {
		useAsTitle: "version",
		defaultColumns: ["role", "version", "publishedAt", "requiresReacceptance"],
		group: "Resale",
	},
	access: {
		read: termsRead,
		create: administratorOnly,
		update: administratorOnly,
		delete: administratorOnly,
	},
	indexes: [{ fields: ["role", "version"], unique: true }],
	hooks: {
		beforeValidate: [
			({ data }) => {
				if (data?.requiresReacceptance !== true) return data;
				const publishedAt = data.publishedAt;
				const enforceAt = data.enforceAt;
				if (!publishedAt || !enforceAt) {
					throw new Error(
						"Resale terms requiring reacceptance need publication and enforcement dates.",
					);
				}
				const publishedTime = new Date(publishedAt).getTime();
				const enforceTime = new Date(enforceAt).getTime();
				if (
					!Number.isFinite(publishedTime) ||
					!Number.isFinite(enforceTime) ||
					enforceTime < publishedTime + 30 * 24 * 60 * 60 * 1000
				) {
					throw new Error(
						"Resale terms enforcement must be at least 30 days after publication.",
					);
				}
				return data;
			},
		],
	},
	fields: [
		{
			type: "row",
			fields: [
				{
					name: "role",
					type: "select",
					required: true,
					options: ["supplier", "reseller"].map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "50%" },
				},
				{
					name: "version",
					type: "text",
					required: true,
					validate: (value: unknown) => {
						if (
							typeof value !== "string" ||
							!/^\d{4}-\d{2}-\d{2}$/.test(value)
						) {
							return "Use YYYY-MM-DD version format.";
						}
						const date = new Date(`${value}T00:00:00.000Z`);
						return date.toISOString().slice(0, 10) === value
							? true
							: "Use a valid calendar date for the terms version.";
					},
					admin: { width: "50%" },
				},
			],
		},
		{ name: "bodyFr", type: "richText", required: true },
		{ name: "bodyEn", type: "richText", required: true },
		{ name: "summaryFr", type: "textarea" },
		{ name: "summaryEn", type: "textarea" },
		{
			type: "row",
			fields: [
				{ name: "publishedAt", type: "date", admin: { width: "33%" } },
				{
					name: "requiresReacceptance",
					type: "checkbox",
					defaultValue: false,
					admin: { width: "33%" },
				},
				{ name: "enforceAt", type: "date", admin: { width: "33%" } },
			],
		},
	],
	timestamps: true,
};
