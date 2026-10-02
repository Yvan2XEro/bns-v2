import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";
import {
	enforceReviewRules,
	translateReviewWriteConflicts,
	updateShopRating,
	updateUserRating,
} from "../hooks/reviews";
import { isNotificationProviderConfigured } from "../services/notificationProvider";

/**
 * The (reviewer, reviewedUser) uniqueness constraint is not declared here: it
 * is a raw-driver index built by migration 20260915_000100_p0_reviews_audit,
 * and only once that migration finds no legacy duplicate reviews left to
 * resolve first. `enforceReviewRules` (create) still rejects an obvious
 * duplicate on every write, and `translateReviewWriteConflicts` (afterError)
 * translates the index's own rejection when two creates race past that
 * check — but if the migration skipped building the index, that race is not
 * closed. Check its logs for whether the index actually exists.
 */
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
		beforeChange: [enforceReviewRules],
		afterError: [translateReviewWriteConflicts],
		afterChange: [
			async ({ doc, req, operation }) => {
				const reviewedUserId =
					typeof doc.reviewedUser === "string"
						? doc.reviewedUser
						: doc.reviewedUser?.id;
				if (reviewedUserId) {
					await updateUserRating({ req, reviewedUserId });
				}

				const shopId = typeof doc.shop === "string" ? doc.shop : doc.shop?.id;
				if (shopId) {
					await updateShopRating(req, shopId);
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

				const shopId = typeof doc.shop === "string" ? doc.shop : doc.shop?.id;
				if (shopId) {
					await updateShopRating(req, shopId);
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
		{ name: "order", type: "relationship", relationTo: "orders" },
		{ name: "shop", type: "relationship", relationTo: "shops", index: true },
		{
			// Service-set: the order review path (a later task) is the only
			// writer, matching P3's I1 — a client claiming this itself is a
			// field-level rule, not a hook comment, so it is closed here even
			// before that service exists.
			name: "verifiedPurchase",
			type: "checkbox",
			defaultValue: false,
			access: { create: () => false },
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
