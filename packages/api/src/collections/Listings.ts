import type { CollectionConfig, Where } from "payload";

import { authenticated } from "../access/authenticated";
import { isOwnerOrAdmin } from "../access/isOwnerOrAdmin";

export const Listings: CollectionConfig = {
	slug: "listings",
	admin: {
		useAsTitle: "title",
		defaultColumns: [
			"title",
			"price",
			"category",
			"status",
			"seller",
			"createdAt",
		],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) {
				return { status: { equals: "published" } } as Where;
			}
			const u = user as { role?: string };
			if (u.role === "admin" || u.role === "moderator") {
				return true;
			}
			return {
				or: [
					{ status: { equals: "published" } },
					{ seller: { equals: user.id } },
				],
			} as Where;
		},
		create: authenticated,
		update: isOwnerOrAdmin,
		delete: isOwnerOrAdmin,
		admin: ({ req: { user } }) => {
			const userWithRole = user as { role?: string } | undefined;
			return (
				userWithRole?.role === "admin" || userWithRole?.role === "moderator"
			);
		},
	},
	hooks: {
		beforeChange: [
			async ({ data, req, operation }) => {
				if (operation === "create") {
					data.seller = req.user?.id;
					if (data.status === "published") {
						data.status = "pending";
					}
					// Set expiry date based on duration (default 30 days)
					const durationDays =
						data.duration && [30, 60, 90].includes(Number(data.duration))
							? Number(data.duration)
							: 30;
					const expiresAt = new Date();
					expiresAt.setDate(expiresAt.getDate() + durationDays);
					data.expiresAt = expiresAt.toISOString();
					// Remove duration from data as it's not a persisted field
					data.duration = undefined;
				}

				if (operation === "update" && data.status === "published") {
					const u = req.user as { role?: string } | undefined;
					if (u?.role !== "admin" && u?.role !== "moderator") {
						data.status = "pending";
					}
				}

				return data;
			},
		],
		afterChange: [
			async ({ doc, operation, previousDoc }) => {
				if (process.env.REDIS_URL) {
					const { publishSearchEvent } = await import("../hooks/searchEvents");
					const event =
						operation === "create" ? "listing.created" : "listing.updated";
					await publishSearchEvent(event, doc.id as string);
				}

				if (!process.env.NOVU_SECRET_KEY) return;
				if (operation !== "update") return;
				if (!previousDoc || previousDoc.status === doc.status) return;

				const sellerId =
					typeof doc.seller === "string"
						? doc.seller
						: (doc.seller as { id: string })?.id;
				if (!sellerId) return;

				try {
					const { triggerNovuEvent } = await import("../hooks/novuEvents");

					if (doc.status === "rejected" && previousDoc.status !== "rejected") {
						await triggerNovuEvent({
							event: "listing-rejected",
							subscriberId: sellerId,
							payload: {
								listingTitle: doc.title,
								reason: doc.rejectionReason || "No reason provided",
							},
						});
					} else if (
						doc.status === "published" &&
						previousDoc.status !== "published"
					) {
						await triggerNovuEvent({
							event: "listing-approved",
							subscriberId: sellerId,
							payload: { listingTitle: doc.title },
						});
					} else {
						await triggerNovuEvent({
							event: "listing-status",
							subscriberId: sellerId,
							payload: {
								listingTitle: doc.title,
								listingId: doc.id,
								oldStatus: previousDoc.status,
								newStatus: doc.status,
							},
						});
					}
				} catch (error) {
					console.error("[novu] Failed to notify listing status:", error);
				}
			},
		],
		afterDelete: [
			async ({ doc }) => {
				if (process.env.REDIS_URL) {
					const { publishSearchEvent } = await import("../hooks/searchEvents");
					await publishSearchEvent("listing.deleted", doc.id as string);
				}
			},
		],
	},
	fields: [
		{
			name: "title",
			type: "text",
			required: true,
			index: true,
		},
		{
			name: "description",
			type: "textarea",
			required: true,
		},
		{
			name: "price",
			type: "number",
			required: true,
			index: true,
		},
		{
			name: "images",
			type: "array",
			fields: [
				{
					name: "image",
					type: "upload",
					relationTo: "media",
					required: true,
				},
			],
		},
		{
			name: "location",
			type: "text",
			required: true,
			index: true,
		},
		{
			name: "seller",
			type: "relationship",
			relationTo: "users",
			required: false,
			hasMany: false,
			// admin: {
			// 	readOnly: true,
			// },
		},
		{
			name: "category",
			type: "relationship",
			relationTo: "categories",
			required: true,
			index: true,
		},
		{
			name: "status",
			type: "select",
			options: [
				{ label: "Draft", value: "draft" },
				{ label: "Pending review", value: "pending" },
				{ label: "Published", value: "published" },
				{ label: "Rejected", value: "rejected" },
				{ label: "Sold", value: "sold" },
				{ label: "Expired", value: "expired" },
				{ label: "Deleted", value: "deleted" },
			],
			defaultValue: "draft",
			required: true,
			index: true,
		},
		{
			name: "boostedUntil",
			type: "date",
			admin: {
				readOnly: true,
			},
		},
		{
			name: "expiresAt",
			type: "date",
			admin: {
				readOnly: true,
			},
		},
		{
			name: "views",
			type: "number",
			defaultValue: 0,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "attributes",
			type: "json",
		},
		{
			name: "coordinates",
			type: "group",
			fields: [
				{ name: "lat", type: "number" },
				{ name: "lng", type: "number" },
			],
		},
		{
			name: "rejectionReason",
			type: "textarea",
			admin: {
				description: "Reason for rejection (visible to seller)",
			},
		},
		{
			name: "condition",
			type: "select",
			options: [
				{ label: "New", value: "new" },
				{ label: "Like New", value: "like_new" },
				{ label: "Good", value: "good" },
				{ label: "Fair", value: "fair" },
				{ label: "Poor", value: "poor" },
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
