import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";
import { updateUserRating } from "../hooks/reviews";

export const Reviews: CollectionConfig = {
	slug: "reviews",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["reviewer", "reviewedUser", "rating", "createdAt"],
	},
	access: {
		read: () => true,
		create: authenticated,
		update: ({ req: { user } }) => {
			if (!user) return false;
			const userWithRole = user as { role?: string };
			return userWithRole.role === "admin";
		},
		delete: ({ req: { user } }) => {
			if (!user) return false;
			const userWithRole = user as { role?: string };
			return userWithRole.role === "admin";
		},
	},
	hooks: {
		afterChange: [
			async ({ doc, req }) => {
				const reviewedUserId =
					typeof doc.reviewedUser === "string"
						? doc.reviewedUser
						: doc.reviewedUser?.id;
				if (reviewedUserId) {
					await updateUserRating({ req, reviewedUserId });
				}
			},
		],
		afterDelete: [
			async ({ doc, req }) => {
				const reviewedUserId =
					typeof doc.reviewedUser === "string"
						? doc.reviewedUser
						: doc.reviewedUser?.id;
				if (reviewedUserId) {
					await updateUserRating({ req, reviewedUserId });
				}
			},
		],
	},
	fields: [
		{
			name: "reviewer",
			type: "relationship",
			relationTo: "users",
			required: true,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "reviewedUser",
			type: "relationship",
			relationTo: "users",
			required: true,
		},
		{
			name: "listing",
			type: "relationship",
			relationTo: "listings",
			required: false,
		},
		{
			name: "rating",
			type: "number",
			required: true,
			min: 1,
			max: 5,
		},
		{
			name: "comment",
			type: "textarea",
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
