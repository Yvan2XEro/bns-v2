import type { CollectionConfig } from "payload";
import { staffOnly, staffOnlyField } from "../access/staff";
import { COURIER_PROVIDER_IDS } from "../lib/delivery/types";
import { LAUNCH_CITY_KEYS } from "../lib/launchCities";

const COURIER_SCOPES = ["same_city", "intercity"] as const;

export const Couriers: CollectionConfig = {
	slug: "couriers",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "key", "provider", "status", "billingMode"],
	},
	access: {
		read: async ({ req }) =>
			req.user && ["admin", "moderator"].includes(req.user.role ?? "")
				? true
				: { status: { equals: "active" } },
		create: staffOnly,
		update: staffOnly,
		delete: staffOnly,
	},
	fields: [
		{
			name: "key",
			type: "text",
			required: true,
			unique: true,
			index: true,
			access: { read: staffOnlyField },
			validate: (value: unknown) =>
				value == null ||
				(typeof value === "string" && /^[a-z0-9-]{3,30}$/.test(value))
					? true
					: "Use 3–30 lowercase letters, numbers or hyphens.",
		},
		{ name: "name", type: "text", required: true },
		{ name: "logo", type: "upload", relationTo: "media" },
		{
			name: "provider",
			type: "select",
			required: true,
			access: { read: staffOnlyField },
			options: COURIER_PROVIDER_IDS.map((value) => ({ label: value, value })),
		},
		{
			name: "scopes",
			type: "select",
			hasMany: true,
			required: true,
			options: COURIER_SCOPES.map((value) => ({ label: value, value })),
		},
		{
			name: "cities",
			type: "select",
			hasMany: true,
			required: true,
			options: LAUNCH_CITY_KEYS.map((value) => ({ label: value, value })),
		},
		{
			name: "destinationCities",
			type: "select",
			hasMany: true,
			options: LAUNCH_CITY_KEYS.map((value) => ({ label: value, value })),
		},
		{ name: "supportsCod", type: "checkbox", defaultValue: false },
		{
			name: "tariffs",
			type: "array",
			fields: [
				{
					name: "city",
					type: "select",
					required: true,
					options: LAUNCH_CITY_KEYS.map((value) => ({ label: value, value })),
				},
				{ name: "district", type: "text" },
				{ name: "amount", type: "number", required: true, min: 0 },
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
			],
		},
		{
			name: "trackingUrlTemplate",
			type: "text",
			access: { read: staffOnlyField },
		},
		{
			name: "contact",
			type: "group",
			access: { read: staffOnlyField },
			fields: [
				{ name: "phone", type: "text" },
				{ name: "email", type: "email" },
			],
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "disabled",
			index: true,
			options: ["active", "paused", "disabled"].map((value) => ({
				label: value,
				value,
			})),
		},
		{
			name: "billingMode",
			type: "select",
			required: true,
			defaultValue: "shop_account",
			access: { read: staffOnlyField },
			options: ["shop_account", "platform_account"].map((value) => ({
				label: value,
				value,
			})),
			validate: (value: unknown) =>
				value === "shop_account" ||
				"P7 allows shop_account only; delivery money must not pass through BuyNSellem.",
		},
	],
	timestamps: true,
};
