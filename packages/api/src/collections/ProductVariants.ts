import { APIError, type CollectionConfig, type Where } from "payload";
import { isAdmin } from "../access/roles";
import {
	can,
	shopField,
	shopRoleFieldAccess,
	shopScopedRead,
} from "../access/shopRoles";
import { relationId } from "../lib/relationId";
import { isOutOfStock } from "../lib/variants";

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
		// Runs before field access, on every doc a caller's document-level read
		// already let through (anonymous or not): `available` is derived from
		// the raw counters here so a buyer response can carry a purchasability
		// signal without carrying `stockOnHand`/`stockReserved` themselves, the
		// same way `Users.phoneVerified` is derived from a field nobody reads.
		beforeRead: [
			({ doc }) => {
				doc.available = !isOutOfStock(doc);
				return doc;
			},
		],
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
		{
			name: "sku",
			type: "text",
			index: true,
			maxLength: 60,
			// Shop data, same as the stock counters below: any active member
			// (staff records receipts against a SKU, not just owner/manager), but
			// nobody outside the shop — `listPublicVariants`' buyer-facing view
			// omits it on purpose.
			access: { read: shopRoleFieldAccess((role) => role !== null) },
		},
		{ name: "price", type: "number", required: true, min: 0 },
		{
			name: "cost",
			type: "number",
			min: 0,
			// A shop secret: nobody outside the shop's management reads it,
			// through this collection or through a populated relation.
			access: { read: shopRoleFieldAccess((role) => can(role, "costs.view")) },
		},
		{ name: "trackInventory", type: "checkbox", defaultValue: true },
		{
			name: "stockOnHand",
			type: "number",
			defaultValue: 0,
			admin: { readOnly: true },
			// Exact counts are shop data: an outsider gets `available` below,
			// never the raw number a competitor could read off every listing.
			access: { read: shopRoleFieldAccess((role) => role !== null) },
		},
		{
			name: "stockReserved",
			type: "number",
			defaultValue: 0,
			admin: { readOnly: true },
			access: { read: shopRoleFieldAccess((role) => role !== null) },
		},
		{
			name: "lowStockThreshold",
			type: "number",
			min: 0,
			// Tells a reader how close to running dry a shop is: a shop secret,
			// same predicate as `cost` — manage-only. `stockSummary` (the shaped
			// route that surfaces it) already requires `costs.view`.
			access: { read: shopRoleFieldAccess((role) => can(role, "costs.view")) },
		},
		{
			name: "available",
			type: "checkbox",
			virtual: true,
			// Set in `beforeRead`, before field access runs, from the raw
			// counters — so this survives for every reader who can see the
			// document at all, including the ones `stockOnHand` is hidden from.
			admin: {
				readOnly: true,
				description:
					"Buyer-safe purchasability signal: true when the variant can be bought right now.",
			},
		},
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
		{
			name: "resale",
			type: "group",
			access: {
				read: shopRoleFieldAccess((role) => can(role, "resale.manage")),
			},
			fields: [
				{ name: "enabled", type: "checkbox", defaultValue: true },
				{ name: "supplierPrice", type: "number", min: 100 },
				{ name: "minRetailPrice", type: "number", min: 0 },
				{ name: "suggestedRetailPrice", type: "number", min: 0 },
			],
		},
	],
	timestamps: true,
};
