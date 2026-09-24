import { APIError, type CollectionConfig, type Where } from "payload";
import { isAdmin, isModerator } from "../access/roles";
import {
	canManageShop,
	resolveShopRole,
	shopField,
	shopScopedRead,
} from "../access/shopRoles";
import { relationId } from "../lib/relationId";

/**
 * `exists: false` on a date field does not match a stored null in Mongo, and a
 * restored variant carries `archivedAt: null`, so both shapes are spelled out.
 */
export const NOT_ARCHIVED: Where = {
	or: [{ archivedAt: { exists: false } }, { archivedAt: { equals: null } }],
};

/**
 * What anyone outside the shop may see: a live variant of a product that is
 * itself published. Stock levels and an unreleased catalogue are shop data, so
 * a draft or archived product hides its variants from the public API.
 *
 * `product.status` is a relationship path: the Mongo adapter resolves it into a
 * sub-query on `products` and rewrites the constraint to `product: { $in }`
 * (`db-mongodb/queries/buildSearchParams.js`), so it filters for real rather
 * than matching nothing.
 */
export const PUBLIC_VARIANTS: Where = {
	and: [NOT_ARCHIVED, { "product.status": { equals: "active" } }],
};

export const ProductVariants: CollectionConfig = {
	slug: "product-variants",
	admin: {
		useAsTitle: "sku",
		defaultColumns: ["product", "sku", "price", "stockOnHand", "archivedAt"],
	},
	access: {
		read: shopScopedRead(() => PUBLIC_VARIANTS),
		create: () => false,
		update: () => false,
		delete: () => false,
		admin: ({ req: { user } }) => isAdmin(user),
	},
	hooks: {
		beforeChange: [
			async ({ data, originalDoc, req }) => {
				const productId = relationId(data.product);
				if (!productId || productId === relationId(originalDoc?.product)) {
					return data;
				}

				const product = await req.payload
					.findByID({
						collection: "products",
						id: productId,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null);
				if (!product) {
					throw new APIError("The product does not exist.", 400);
				}
				if (relationId(product.shop) !== relationId(data.shop)) {
					throw new APIError(
						"A variant cannot be filed under another shop than its product.",
						400,
					);
				}
				return data;
			},
		],
	},
	fields: [
		{
			name: "product",
			type: "relationship",
			relationTo: "products",
			required: true,
			index: true,
		},
		// Denormalised from the product so stock queries and field access need no join.
		shopField({ required: true, picker: false }),
		{ name: "optionValues", type: "json" },
		{ name: "sku", type: "text", index: true, maxLength: 60 },
		{ name: "price", type: "number", required: true, min: 0 },
		{
			name: "cost",
			type: "number",
			min: 0,
			// A shop secret: nobody outside the shop's team reads it, through this
			// collection or through a populated relation.
			access: {
				read: async ({ req, doc }) => {
					if (!req.user) return false;
					if (isModerator(req.user)) return true;
					const role = await resolveShopRole(
						req.payload,
						String(req.user.id),
						relationId(doc?.shop),
						req.context,
					);
					return canManageShop(role);
				},
			},
		},
		{ name: "trackInventory", type: "checkbox", defaultValue: true },
		{
			name: "stockOnHand",
			type: "number",
			defaultValue: 0,
			admin: { readOnly: true },
		},
		{
			name: "stockReserved",
			type: "number",
			defaultValue: 0,
			admin: { readOnly: true },
		},
		{ name: "lowStockThreshold", type: "number", min: 0 },
		{
			name: "archivedAt",
			type: "date",
			index: true,
			admin: {
				readOnly: true,
				description:
					"Set when the variant is removed from its product; movements are kept.",
			},
		},
	],
	timestamps: true,
};
