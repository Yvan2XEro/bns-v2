import type { CollectionConfig } from "payload";
import { anyone } from "@/access/anyone";

export const Users: CollectionConfig = {
	slug: "users",
	admin: {
		useAsTitle: "email",
		defaultColumns: ["email", "name", "role", "rating", "createdAt"],
	},
	auth: true,
	access: {
		create: anyone,
		admin: ({ req }) =>
			req.user?.role === "admin" || req.user?.role === "moderator",
	},
	hooks: {
		beforeChange: [
			({ req, data, operation, originalDoc }) => {
				const user = req.user as { role?: string } | undefined;
				const isAdmin = user?.role === "admin";

				// On create, force role to "user" unless admin
				if (operation === "create" && !isAdmin) {
					data.role = "user";
					data.verified = undefined;
					data.rating = undefined;
					data.totalReviews = undefined;
				}

				// On update, prevent non-admins from changing protected fields
				if (operation === "update" && !isAdmin) {
					data.role = originalDoc?.role;
					data.verified = originalDoc.verified;
					data.rating = originalDoc?.rating;
					data.totalReviews = originalDoc.totalReviews;
				}

				return data;
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
