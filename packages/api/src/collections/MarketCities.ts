import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";
import { invalidateMarketCities } from "../lib/marketCities";

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec =>
	value !== null && typeof value === "object" ? (value as Rec) : {};

const relId = (value: unknown): unknown => rec(value).id ?? value;

const refuseInvalidCity: CollectionBeforeChangeHook = async ({
	data,
	originalDoc,
	req,
}) => {
	const stored = rec(originalDoc);
	const merged = { ...stored, ...rec(data) };
	const slugs = (Array.isArray(merged.districts) ? merged.districts : []).map(
		(d) => rec(d).slug,
	);
	if (new Set(slugs).size !== slugs.length)
		throw new Error("District slugs must be unique within a city.");
	if (typeof merged.key === "string" && merged.market !== undefined) {
		const { docs } = await req.payload.find({
			collection: "market-cities",
			where: {
				and: [
					{ market: { equals: relId(merged.market) } },
					{ key: { equals: merged.key } },
				],
			},
			limit: 2,
			depth: 0,
			overrideAccess: true,
		});
		if (docs.some((d) => String(d.id) !== String(stored.id ?? "")))
			throw new Error(
				`The city "${merged.key}" already exists in this market.`,
			);
	}
	return data;
};

export const MarketCities: CollectionConfig = {
	slug: "market-cities",
	admin: {
		group: "Configuration",
		useAsTitle: "label",
		defaultColumns: ["market", "key", "label", "active", "sortOrder"],
	},
	access: {
		read: ({ req: { user } }) => isAdmin(user as { role?: string } | null),
		create: ({ req: { user } }) => isAdmin(user as { role?: string } | null),
		update: ({ req: { user } }) => isAdmin(user as { role?: string } | null),
		delete: ({ req: { user } }) => isAdmin(user as { role?: string } | null),
	},
	hooks: {
		beforeChange: [refuseInvalidCity],
		afterChange: [
			({ doc, req }) => {
				invalidateMarketCities(req.payload);
				return doc;
			},
		],
		afterDelete: [
			({ doc, req }) => {
				invalidateMarketCities(req.payload);
				return doc;
			},
		],
	},
	indexes: [{ fields: ["market", "key"], unique: true }],
	fields: [
		{
			type: "row",
			fields: [
				{
					name: "market",
					type: "relationship",
					relationTo: "markets",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
				{
					name: "key",
					type: "text",
					required: true,
					validate: (value: unknown) =>
						typeof value === "string" && /^[a-z0-9-]{2,30}$/.test(value)
							? true
							: "Use 2-30 lower-case letters, digits or hyphens.",
					admin: { width: "33%" },
				},
				{
					name: "label",
					type: "text",
					required: true,
					admin: { width: "33%" },
				},
			],
		},
		{
			name: "districts",
			type: "array",
			admin: { description: "{city}.other is implicit and always accepted." },
			fields: [
				{ name: "slug", type: "text", required: true },
				{ name: "label", type: "text", required: true },
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "defaultDeliveryFee",
					type: "number",
					required: true,
					min: 0,
					validate: (value: unknown) =>
						Number.isInteger(value) && (value as number) >= 0
							? true
							: "A fee is a non-negative integer in minor units.",
					admin: { width: "33%" },
				},
				{
					name: "active",
					type: "checkbox",
					defaultValue: true,
					admin: { width: "33%" },
				},
				{
					name: "sortOrder",
					type: "number",
					defaultValue: 0,
					admin: { width: "33%" },
				},
			],
		},
	],
	timestamps: true,
};
