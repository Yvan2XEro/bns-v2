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

				if (operation === "create" && !isAdmin) {
					data.role = "user";
					data.verified = undefined;
					data.rating = undefined;
					data.totalReviews = undefined;
				}

				if (operation === "update" && !isAdmin) {
					data.role = originalDoc?.role;
					data.verified = originalDoc.verified;
					data.rating = originalDoc?.rating;
					data.totalReviews = originalDoc.totalReviews;
				}

				return data;
			},
		],
		afterChange: [
			async ({ doc, operation, previousDoc }) => {
				if (!process.env.NOVU_SECRET_KEY) return;

				try {
					const { syncNovuSubscriber, triggerNovuEvent } = await import(
						"../hooks/novuEvents"
					);

					const avatarUrl =
						typeof doc.avatar === "object" && doc.avatar?.url
							? doc.avatar.url
							: undefined;

					await syncNovuSubscriber({
						subscriberId: doc.id as string,
						email: doc.email,
						name: doc.name,
						avatar: avatarUrl,
					});

					// Notify user when they become verified
					if (
						operation === "update" &&
						doc.verified &&
						previousDoc &&
						!previousDoc.verified
					) {
						await triggerNovuEvent({
							event: "user-verified",
							subscriberId: doc.id as string,
							payload: { name: doc.name },
						});
					}
				} catch (error) {
					console.error("[novu] Failed to sync subscriber:", error);
				}
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
				position: "sidebar",
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
