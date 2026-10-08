import type { CollectionConfig } from "payload";
import { serviceOnly } from "../access/caseRoles";
import { LAUNCH_CITY_KEYS } from "../lib/launchCities";

export const DELIVERY_SCOPES = ["same_city", "intercity"] as const;
export const DELIVERY_METHODS = ["seller_delivery", "courier"] as const;
export const DELIVERY_DAYS = [
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
	"sun",
] as const;

export const DeliveryZones: CollectionConfig = {
	slug: "delivery-zones",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["shop", "city", "scope", "method", "active"],
	},
	access: {
		read: serviceOnly,
		create: serviceOnly,
		update: serviceOnly,
		delete: serviceOnly,
	},
	hooks: {
		beforeValidate: [
			({ data }) => {
				if (
					typeof data?.etaMinHours === "number" &&
					typeof data.etaMaxHours === "number" &&
					data.etaMinHours > data.etaMaxHours
				) {
					throw new Error("Minimum delivery ETA cannot exceed maximum ETA.");
				}
				return data;
			},
		],
	},
	indexes: [{ fields: ["shop", "city", "active"] }],
	fields: [
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{ name: "name", type: "text", required: true, minLength: 2, maxLength: 40 },
		{
			name: "scope",
			type: "select",
			required: true,
			options: DELIVERY_SCOPES.map((value) => ({ label: value, value })),
		},
		{
			name: "city",
			type: "select",
			required: true,
			options: LAUNCH_CITY_KEYS.map((value) => ({ label: value, value })),
		},
		{
			name: "districts",
			type: "array",
			fields: [{ name: "key", type: "text", required: true }],
			admin: { description: "Empty means the whole city." },
		},
		{
			name: "destinationCities",
			type: "select",
			hasMany: true,
			options: LAUNCH_CITY_KEYS.map((value) => ({ label: value, value })),
			admin: {
				condition: (_, siblingData) => siblingData.scope === "intercity",
			},
		},
		{
			name: "method",
			type: "select",
			required: true,
			options: DELIVERY_METHODS.map((value) => ({ label: value, value })),
		},
		{
			name: "courier",
			type: "relationship",
			relationTo: "couriers",
			admin: {
				condition: (_, siblingData) => siblingData.method === "courier",
			},
		},
		{ name: "fee", type: "number", required: true, min: 0, max: 50_000 },
		{ name: "freeAboveSubtotal", type: "number", min: 0 },
		{ name: "minOrderSubtotal", type: "number", min: 0 },
		{
			name: "etaMinHours",
			type: "number",
			required: true,
			min: 1,
			max: 720,
		},
		{
			name: "etaMaxHours",
			type: "number",
			required: true,
			min: 1,
			max: 720,
		},
		{
			name: "cutoffTime",
			type: "text",
			validate: (value: unknown) =>
				value == null ||
				(typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
					? true
					: "Use 24-hour HH:mm format.",
		},
		{
			name: "deliveryDays",
			type: "select",
			hasMany: true,
			required: true,
			defaultValue: ["mon", "tue", "wed", "thu", "fri", "sat"],
			options: DELIVERY_DAYS.map((value) => ({ label: value, value })),
		},
		{ name: "codAllowed", type: "checkbox", defaultValue: true },
		{ name: "active", type: "checkbox", defaultValue: true, index: true },
		{ name: "sortOrder", type: "number", defaultValue: 0 },
		{ name: "metadata", type: "json" },
	],
	timestamps: true,
};
