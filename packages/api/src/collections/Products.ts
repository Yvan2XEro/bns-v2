import { APIError, type CollectionConfig, type Where } from "payload";
import { isAdmin } from "../access/roles";
import { shopField, shopScopedRead } from "../access/shopRoles";
import { relationId } from "../lib/relationId";

export const PRODUCT_SERVICE_CONTEXT = { productService: true } as const;

/** Every write goes through services/products.ts (and PATCH /api/products/:id, Task 10). */
export const Products: CollectionConfig = {
	slug: "products",
	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "shop", "status", "updatedAt"],
	},
	access: {
		read: shopScopedRead(() => ({ status: { equals: "active" } }) as Where),
		create: () => false,
		update: () => false,
		delete: () => false,
		admin: ({ req: { user } }) => isAdmin(user),
	},
	hooks: {
		beforeChange: [
			async ({ data, originalDoc, req }) => {
				const listingId = relationId(data.listing);
				if (!listingId || listingId === relationId(originalDoc?.listing)) {
					return data;
				}

				const listing = await req.payload
					.findByID({
						collection: "listings",
						id: listingId,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null);
				if (!listing) {
					throw new APIError("The listing does not exist.", 400);
				}

				const shopId = relationId(data.shop) ?? relationId(originalDoc?.shop);
				if (!shopId || relationId(listing.shop) !== shopId) {
					throw new APIError(
						"A product cannot claim a listing from another shop.",
						400,
					);
				}

				const claimedBy = relationId(listing.product);
				const productId = relationId(originalDoc?.id ?? data.id);
				if (claimedBy && productId && claimedBy !== productId) {
					throw new APIError(
						"This listing already belongs to another product.",
						400,
					);
				}

				return data;
			},
		],
	},
	fields: [
		shopField({ required: true, picker: false }),
		{
			name: "title",
			type: "text",
			required: true,
			minLength: 3,
			maxLength: 120,
		},
		{ name: "description", type: "textarea", maxLength: 5000 },
		{
			name: "category",
			type: "relationship",
			relationTo: "categories",
			required: true,
			index: true,
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
		{ name: "attributes", type: "json" },
		{
			name: "images",
			type: "array",
			maxRows: 10,
			fields: [
				{ name: "image", type: "upload", relationTo: "media", required: true },
			],
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "draft",
			index: true,
			options: [
				{ label: "Draft", value: "draft" },
				{ label: "Active", value: "active" },
				{ label: "Archived", value: "archived" },
			],
		},
		{
			name: "options",
			type: "array",
			maxRows: 3,
			fields: [
				{ name: "name", type: "text", required: true, maxLength: 30 },
				{ name: "values", type: "text", hasMany: true, required: true },
			],
		},
		{
			name: "delivery",
			type: "group",
			fields: [
				{ name: "handlingHours", type: "number", min: 0, max: 720 },
				{ name: "weightGrams", type: "number", min: 0 },
				{ name: "codAllowed", type: "checkbox", defaultValue: true },
				{ name: "pickupAllowed", type: "checkbox", defaultValue: false },
			],
		},
		{ name: "returnPolicy", type: "textarea", maxLength: 2000 },
		{
			name: "listing",
			type: "relationship",
			relationTo: "listings",
			index: true,
			admin: {
				readOnly: true,
				description: "The published listing, written by the product service.",
			},
		},
	],
	timestamps: true,
};
