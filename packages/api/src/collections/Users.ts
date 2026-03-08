import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
	slug: "users",
	admin: {
		useAsTitle: "email",
		defaultColumns: ["email", "name", "role", "rating", "createdAt"],
	},
	auth: true,
	fields: [
		{
			name: "name",
			type: "text",
			required: true,
		},
		{
			name: "avatar",
			type: "upload",
			relationTo: "media",
		},
		{
			name: "role",
			type: "select",
			hasMany: false,
			options: [
				{ label: "User", value: "user" },
				{ label: "Moderator", value: "moderator" },
				{ label: "Admin", value: "admin" },
			],
			defaultValue: "user",
			required: true,
			saveToJWT: true,
		},
		{
			name: "rating",
			type: "number",
			min: 0,
			max: 5,
			defaultValue: 0,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "totalReviews",
			type: "number",
			defaultValue: 0,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "bio",
			type: "textarea",
		},
		{
			name: "phone",
			type: "text",
		},
		{
			name: "location",
			type: "text",
		},
		{
			name: "verified",
			type: "checkbox",
			defaultValue: false,
			admin: {
				readOnly: true,
			},
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
