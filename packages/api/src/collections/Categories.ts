import type { CollectionConfig } from "payload";
import { anyone } from "../access/anyone";

export interface CategoryAttribute {
	name: string;
	slug: string;
	type: "text" | "number" | "select" | "boolean" | "date";
	required: boolean;
	filterable: boolean;
	options?: string[];
}

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
			name: "attributes",
			type: "array",
			required: false,
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
						condition: (data, siblingData) => siblingData?.type === "select",
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
