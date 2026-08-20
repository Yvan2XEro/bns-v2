import type { CollectionConfig } from "payload";
import { anyone } from "../access/anyone";
import { decorateCategoryWithFormPreset } from "../lib/listingFormPreset";

export interface CategoryAttribute {
	name: string;
	slug: string;
	type: "text" | "number" | "select" | "boolean" | "date";
	required: boolean;
	filterable: boolean;
	options?: string[];
	/** Suffix rendered after the value, e.g. "km", "m²", "ch". */
	unit?: string | null;
	/** Section heading used to group attributes in the form and on the listing. */
	group?: string | null;
	/** Inclusive bounds, number attributes only. */
	min?: number | null;
	max?: number | null;
}

const LISTING_FORM_FIELD_MODES = [
	{ label: "Inherit from parent category", value: "auto" },
	{ label: "Hidden — never shown", value: "hidden" },
	{ label: "Optional — shown, may be left empty", value: "optional" },
	{ label: "Required — shown, must be filled", value: "required" },
];

/** Same four modes as the other core fields, worded for a picture. */
const LISTING_FORM_PHOTO_MODES = [
	{ label: "Inherit from parent category", value: "auto" },
	{ label: "Hidden — the seller is never asked for a photo", value: "hidden" },
	{ label: "Optional — photos allowed, none required", value: "optional" },
	{ label: "Required — at least one photo must be added", value: "required" },
];

export const Categories: CollectionConfig = {
	slug: "categories",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "slug", "parent", "active", "createdAt"],
	},
	access: {
		read: anyone,
		create: ({ req: { user } }) => {
			const userWithRole = user as { role?: string } | undefined;
			return (
				userWithRole?.role === "admin" || userWithRole?.role === "moderator"
			);
		},
		update: ({ req: { user } }) => {
			const userWithRole = user as { role?: string } | undefined;
			return (
				userWithRole?.role === "admin" || userWithRole?.role === "moderator"
			);
		},
		delete: ({ req: { user } }) => {
			const userWithRole = user as { role?: string } | undefined;
			return userWithRole?.role === "admin";
		},
	},
	hooks: {
		afterRead: [
			({ doc }) => {
				if (!doc || typeof doc !== "object") return doc;
				return decorateCategoryWithFormPreset(doc);
			},
		],
	},
	fields: [
		{
			name: "name",
			type: "text",
			required: true,
		},
		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
		},
		{
			name: "description",
			type: "textarea",
		},
		{
			name: "icon",
			type: "text",
		},
		{
			name: "image",
			type: "upload",
			relationTo: "media",
		},
		{
			name: "parent",
			type: "relationship",
			relationTo: "categories",
			hasMany: false,
		},
		{
			name: "active",
			type: "checkbox",
			defaultValue: true,
		},
		{
			name: "listingForm",
			type: "group",
			label: "Listing form",
			admin: {
				description:
					"Decides which of the three built-in fields — price, condition and photos — the ad form shows for this category. Leave everything on “Inherit” to keep the current behaviour: the setting is then taken from the closest parent category that defines one.",
			},
			fields: [
				{
					name: "type",
					type: "select",
					required: false,
					defaultValue: "auto",
					label: "Kind of ad",
					options: [
						{ label: "Inherit from parent category", value: "auto" },
						{
							label:
								"Product — price required, condition shown, photo required",
							value: "product",
						},
						{
							label: "Service — price optional, no condition, photo optional",
							value: "service",
						},
						{
							label: "Job offer — no price, no condition, no photos",
							value: "job",
						},
						{
							label: "Rental — price required, no condition, photo required",
							value: "rental",
						},
						{
							label: "Generic — no price, no condition, photo optional",
							value: "generic",
						},
					],
					admin: {
						description:
							"Pick the closest match and the three fields below follow automatically. Set this on a top-level category and every category underneath inherits it.",
					},
				},
				{
					name: "price",
					type: "select",
					required: false,
					defaultValue: "auto",
					label: "Price field",
					options: LISTING_FORM_FIELD_MODES,
					admin: {
						description:
							"Overrides the price rule that “Kind of ad” would give. Use it for the odd category that does not fit its preset.",
					},
				},
				{
					name: "condition",
					type: "select",
					required: false,
					defaultValue: "auto",
					label: "Condition field",
					options: LISTING_FORM_FIELD_MODES,
					admin: {
						description:
							"Whether the seller is asked how worn the item is (new, like new, good…). Hide it wherever the question makes no sense, such as a holiday rental or a plot of land.",
					},
				},
				{
					name: "photos",
					type: "select",
					required: false,
					defaultValue: "auto",
					label: "Photos",
					options: LISTING_FORM_PHOTO_MODES,
					admin: {
						description:
							"Whether the seller is asked for pictures. Hide it where there is nothing to photograph, such as a job offer, and choose “Optional” where a picture is welcome but not expected, such as a service. Changing this only changes what the form asks for — pictures already added to existing ads are kept.",
					},
				},
				{
					name: "priceLabel",
					type: "text",
					required: false,
					label: "Price label",
					admin: {
						description:
							"Wording shown above the price box, when “Price” is not the right word — for example “Loyer mensuel”, “Salaire” or “Tarif”. Leave empty for the default.",
					},
				},
			],
		},
		{
			name: "attributes",
			type: "array",
			required: false,
			admin: {
				description:
					"Extra fields specific to this category. They appear in the ad form in the order listed here — drag a row to move it.",
			},
			fields: [
				{
					name: "name",
					type: "text",
					required: true,
				},
				{
					name: "slug",
					type: "text",
					required: true,
				},
				{
					name: "type",
					type: "select",
					required: true,
					options: [
						{ label: "Text", value: "text" },
						{ label: "Number", value: "number" },
						{ label: "Select", value: "select" },
						{ label: "Boolean", value: "boolean" },
						{ label: "Date", value: "date" },
					],
				},
				{
					name: "required",
					type: "checkbox",
					defaultValue: false,
				},
				{
					name: "filterable",
					type: "checkbox",
					defaultValue: false,
				},
				{
					name: "options",
					type: "array",
					fields: [
						{
							name: "value",
							type: "text",
							required: true,
						},
					],
					admin: {
						condition: (_data, siblingData) => siblingData?.type === "select",
					},
				},
				{
					name: "unit",
					type: "text",
					required: false,
					label: "Unit",
					admin: {
						description:
							"Shown after the value, e.g. “km”, “m²”, “ch”. Leave empty when the field needs no unit.",
					},
				},
				{
					name: "group",
					type: "text",
					required: false,
					label: "Section",
					admin: {
						description:
							"Heading this field is filed under in the form and on the ad, e.g. “Engine” or “Surface”. Fields sharing a section are shown together. Leave empty to keep it ungrouped.",
					},
				},
				{
					name: "min",
					type: "number",
					required: false,
					label: "Minimum value",
					admin: {
						condition: (_data, siblingData) => siblingData?.type === "number",
						description:
							"Smallest value accepted, inclusive. Leave empty for no lower bound.",
					},
				},
				{
					name: "max",
					type: "number",
					required: false,
					label: "Maximum value",
					admin: {
						condition: (_data, siblingData) => siblingData?.type === "number",
						description:
							"Largest value accepted, inclusive. Leave empty for no upper bound.",
					},
				},
			],
		},
		{
			name: "createdAt",
			type: "date",
			admin: {
				readOnly: true,
			},
		},
	],
	timestamps: true,
};
