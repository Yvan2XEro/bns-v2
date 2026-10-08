import type { CollectionConfig, Where } from "payload";
import { serviceOnly } from "../access/caseRoles";
import { memberShopIds } from "../access/shopRoles";
import { LAUNCH_CITY_KEYS } from "../lib/launchCities";

export const ShopLocations: CollectionConfig = {
	slug: "shop-locations",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["shop", "name", "city", "pickupEnabled", "active"],
	},
	access: {
		read: async ({ req }) => {
			const publicLocations: Where = {
				and: [
					{ active: { equals: true } },
					{ pickupEnabled: { equals: true } },
				],
			};
			if (!req.user) return publicLocations;
			const shops = await memberShopIds(req);
			return shops.length > 0
				? { or: [publicLocations, { shop: { in: shops } }] }
				: publicLocations;
		},
		create: serviceOnly,
		update: serviceOnly,
		delete: serviceOnly,
	},
	hooks: {
		beforeValidate: [
			({ data }) => {
				const hours = data?.openingHours;
				if (data?.pickupEnabled === true) {
					if (
						!Array.isArray(hours) ||
						(hours.length === 0 && data.metadata?.migratedFrom !== "p4")
					) {
						throw new Error("Pickup-enabled locations require opening hours.");
					}
				}
				if (Array.isArray(hours)) {
					for (const entry of hours) {
						if (!entry || typeof entry !== "object") {
							throw new Error("Opening hours must be valid day/time rows.");
						}
						const row = entry as Record<string, unknown>;
						const opens = row.opens;
						const closes = row.closes;
						const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
						if (
							typeof opens !== "string" ||
							typeof closes !== "string" ||
							!timePattern.test(opens) ||
							!timePattern.test(closes) ||
							opens >= closes
						) {
							throw new Error(
								"Opening hours must be HH:mm with closing after opening.",
							);
						}
					}
				}
				return data;
			},
		],
	},
	indexes: [{ fields: ["shop", "active"] }],
	fields: [
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{ name: "name", type: "text", required: true, minLength: 2, maxLength: 60 },
		{
			name: "city",
			type: "select",
			required: true,
			options: LAUNCH_CITY_KEYS.map((value) => ({ label: value, value })),
		},
		{ name: "district", type: "text", required: true },
		{ name: "address", type: "text", maxLength: 200 },
		{
			name: "landmark",
			type: "text",
			required: true,
			minLength: 5,
			maxLength: 200,
		},
		{
			name: "gps",
			type: "group",
			required: true,
			fields: [
				{ name: "lat", type: "number", required: true, min: -90, max: 90 },
				{ name: "lng", type: "number", required: true, min: -180, max: 180 },
			],
		},
		{
			name: "phone",
			type: "text",
			admin: {
				description: "Optional public E.164 phone for this pickup point.",
			},
		},
		{
			name: "openingHours",
			type: "array",
			fields: [
				{
					name: "day",
					type: "select",
					required: true,
					options: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(
						(value) => ({ label: value, value }),
					),
				},
				{
					name: "opens",
					type: "text",
					required: true,
					validate: (value: unknown) =>
						typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
							? true
							: "Use 24-hour HH:mm format.",
				},
				{
					name: "closes",
					type: "text",
					required: true,
					validate: (value: unknown) =>
						typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
							? true
							: "Use 24-hour HH:mm format.",
				},
			],
		},
		{ name: "openingHoursNote", type: "text" },
		{ name: "pickupEnabled", type: "checkbox", defaultValue: false },
		{ name: "pickupFee", type: "number", min: 0, max: 5_000, defaultValue: 0 },
		{ name: "holdDays", type: "number", min: 1, max: 14, defaultValue: 7 },
		{
			name: "preparationHours",
			type: "number",
			min: 0,
			max: 72,
			defaultValue: 2,
		},
		{ name: "isDispatchOrigin", type: "checkbox", defaultValue: false },
		{ name: "isDefaultOrigin", type: "checkbox", defaultValue: false },
		{ name: "active", type: "checkbox", defaultValue: true, index: true },
		{ name: "metadata", type: "json" },
	],
	timestamps: true,
};
