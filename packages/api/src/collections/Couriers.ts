import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";
import { staffOnly, staffOnlyField } from "../access/staff";
import { COURIER_PROVIDER_IDS } from "../lib/delivery/types";
import { LAUNCH_CITY_KEYS } from "../lib/launchCities";

const COURIER_SCOPES = ["same_city", "intercity"] as const;

const strings = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((v): v is string => typeof v === "string")
		: [];

/** Every city a courier serves, prices or reaches must be one market's active rows. */
const refuseCitiesOutsideOneMarket: CollectionBeforeChangeHook = async ({
	data,
	originalDoc,
	req,
}) => {
	const merged: Record<string, unknown> = { ...originalDoc, ...data };
	const tariffs = Array.isArray(merged.tariffs) ? merged.tariffs : [];
	const keys = new Set([
		...strings(merged.cities),
		...strings(merged.destinationCities),
		...tariffs.flatMap((t: { city?: unknown } | null) =>
			typeof t?.city === "string" ? [t.city] : [],
		),
	]);
	if (keys.size === 0) return data;
	const { docs } = await req.payload.find({
		collection: "market-cities",
		where: {
			and: [{ key: { in: [...keys] } }, { active: { equals: true } }],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const perMarket = new Map<string, Set<string>>();
	for (const doc of docs) {
		const market = String(
			typeof doc.market === "object" && doc.market ? doc.market.id : doc.market,
		);
		perMarket.set(market, (perMarket.get(market) ?? new Set()).add(doc.key));
	}
	if (![...perMarket.values()].some((found) => found.size === keys.size))
		throw new Error(
			"A courier's cities must all belong to the active cities of one market.",
		);
	return data;
};

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
	hooks: { beforeChange: [refuseCitiesOutsideOneMarket] },
	fields: [
		{
			type: "row",
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
					admin: { width: "50%" },
				},
				{ name: "name", type: "text", required: true, admin: { width: "50%" } },
			],
		},
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
					type: "row",
					fields: [
						{
							name: "city",
							type: "select",
							required: true,
							options: LAUNCH_CITY_KEYS.map((value) => ({
								label: value,
								value,
							})),
							admin: { width: "50%" },
						},
						{ name: "district", type: "text", admin: { width: "50%" } },
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "amount",
							type: "number",
							required: true,
							min: 0,
							admin: { width: "33%" },
						},
						{
							name: "etaMinHours",
							type: "number",
							required: true,
							min: 1,
							max: 720,
							admin: { width: "33%" },
						},
						{
							name: "etaMaxHours",
							type: "number",
							required: true,
							min: 1,
							max: 720,
							admin: { width: "33%" },
						},
					],
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
				{
					type: "row",
					fields: [
						{ name: "phone", type: "text", admin: { width: "50%" } },
						{ name: "email", type: "email", admin: { width: "50%" } },
					],
				},
			],
		},
		{
			type: "row",
			fields: [
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
					admin: { width: "50%" },
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
					admin: { width: "50%" },
				},
			],
		},
	],
	timestamps: true,
};
