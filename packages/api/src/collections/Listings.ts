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
		read: anyone,
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
				}

				return data;
			},
		],
		afterChange: [
			async ({ doc, operation, req }) => {
				if (process.env.MEILI_HOST) {
					const { syncListingToMeilisearch } = await import(
						"../hooks/meilisearch"
					);
					await syncListingToMeilisearch({
						doc,
						operation,
						req,
					});
				}
			},
		],
		afterDelete: [
			async ({ doc, req }) => {
				if (process.env.MEILI_HOST) {
					const { syncListingToMeilisearch } = await import(
						"../hooks/meilisearch"
					);
					await syncListingToMeilisearch({
						doc,
						operation: "delete",
						req,
					});
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
			admin: {
				readOnly: true,
			},
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
				{ label: "Published", value: "published" },
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
