import type { CollectionConfig } from "payload";
import { anyone } from "../access/anyone";
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
				// Anonymous users: only published listings
				return { status: { equals: "published" } };
			}
			const u = user as { role?: string };
			if (u.role === "admin" || u.role === "moderator") {
				// Admins/moderators: see everything
				return true;
			}
			// Authenticated users: published + their own listings (any status)
			return {
				or: [
					{ status: { equals: "published" } },
					{ seller: { equals: user.id } },
				],
			};
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
					// New listings go to pending review, not directly published
					if (data.status === "published") {
						data.status = "pending";
					}
				}

				if (operation === "update" && data.status === "published") {
					// Only admins/moderators can approve (set to published)
					const u = req.user as { role?: string } | undefined;
					if (u?.role !== "admin" && u?.role !== "moderator") {
						data.status = "pending";
					}
				}

				return data;
			},
		],
		afterChange: [
			async ({ doc, operation }) => {
				if (process.env.REDIS_URL) {
					const { publishSearchEvent } = await import("../hooks/searchEvents");
					const event =
						operation === "create" ? "listing.created" : "listing.updated";
					await publishSearchEvent(event, doc.id as string);
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
