import type { CollectionConfig } from "payload";

export const CART_STATUSES = ["active", "converted", "abandoned"] as const;

/**
 * Server-side cart, one active row per user. The uniqueness itself is a
 * partial index (`carts_active_user_unique`, migration
 * `20261002_000000_p4_order_indexes`), not a hook: two simultaneous
 * `POST /api/cart/items` calls for a user with no cart yet must not both
 * succeed in creating one.
 *
 * Every REST operation is closed. `services/cart.ts` and the `/api/cart`
 * routes are the only way in or out, so a line's price, availability and
 * shop membership are always revalidated at read time rather than trusted
 * from a stored snapshot.
 */
export const Carts: CollectionConfig = {
	slug: "carts",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["user", "status", "lastActivityAt", "createdAt"],
	},
	access: {
		read: () => false,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "active",
			index: true,
			options: CART_STATUSES.map((value) => ({ label: value, value })),
			admin: { readOnly: true },
		},
		{
			name: "items",
			type: "array",
			maxRows: 30,
			fields: [
				{
					name: "listing",
					type: "relationship",
					relationTo: "listings",
					required: true,
				},
				{
					name: "product",
					type: "relationship",
					relationTo: "products",
					required: true,
				},
				{
					name: "variant",
					type: "relationship",
					relationTo: "product-variants",
					required: true,
				},
				{
					// The listing's (storefront) shop. The single-shop-per-cart rule
					// applies to this field in P4; orders are later split by
					// fulfilling shop once P8/P10 land.
					name: "shop",
					type: "relationship",
					relationTo: "shops",
					required: true,
				},
				{ name: "quantity", type: "number", required: true, min: 1, max: 20 },
				{ name: "priceAtAdd", type: "number", required: true },
				{ name: "addedAt", type: "date" },
			],
		},
		{
			name: "convertedOrders",
			type: "relationship",
			relationTo: "orders",
			hasMany: true,
			admin: { readOnly: true },
		},
		{ name: "lastActivityAt", type: "date", index: true },
	],
	timestamps: true,
};
