import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";
import { updateUserRating } from "../hooks/reviews";
import { isNotificationProviderConfigured } from "../services/notificationProvider";

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
			async ({ doc, req, operation }) => {
				const reviewedUserId =
					typeof doc.reviewedUser === "string"
						? doc.reviewedUser
						: doc.reviewedUser?.id;
				if (reviewedUserId) {
					await updateUserRating({ req, reviewedUserId });
				}

				if (operation === "create" && isNotificationProviderConfigured()) {
					try {
						const { triggerNotificationEvent } = await import(
							"../hooks/notificationEvents"
						);

						const reviewerName =
							typeof doc.reviewer === "object" && doc.reviewer?.name
								? doc.reviewer.name
								: (
										await req.payload.findByID({
											collection: "users",
											id:
												typeof doc.reviewer === "string"
													? doc.reviewer
													: doc.reviewer?.id,
										})
									).name;

						await triggerNotificationEvent({
							event: "new-review",
							subscriberId: reviewedUserId,
							payload: {
								reviewerName,
								rating: doc.rating,
								comment: doc.comment || "",
							},
						});
					} catch (error) {
						console.error(
							"[notifications] Failed to notify new review:",
							error,
						);
					}
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
