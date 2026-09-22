import { APIError, type CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";
import { shopField, shopScopedRead } from "../access/shopRoles";
import { relationId } from "../lib/relationId";

export const MOVEMENT_TYPES = [
	"receipt",
	"adjustment",
	"loss",
	"return",
	"sale",
	"reservation",
	"release",
] as const;

/** Append-only ledger; only services/stock.ts writes it. */
export const StockMovements: CollectionConfig = {
	slug: "stock-movements",
	admin: {
		useAsTitle: "type",
		defaultColumns: ["variant", "type", "quantity", "stockAfter", "createdAt"],
	},
	access: {
		read: shopScopedRead(() => false),
		create: () => false,
		update: () => false,
		delete: () => false,
		admin: ({ req: { user } }) => isAdmin(user),
	},
	hooks: {
		beforeChange: [
			async ({ data, operation, req }) => {
				// The hooks, not just `access`, are what makes the ledger append-only:
				// the services write it with `overrideAccess`, which skips access
				// control entirely.
				if (operation !== "create") {
					throw new APIError("The stock ledger is append-only.", 400);
				}

				const variantId = relationId(data.variant);
				if (!variantId) {
					throw new APIError("A movement must name its variant.", 400);
				}
				const variant = await req.payload
					.findByID({
						collection: "product-variants",
						id: variantId,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null);
				if (!variant) {
					throw new APIError("The variant does not exist.", 400);
				}
				if (relationId(variant.shop) !== relationId(data.shop)) {
					throw new APIError(
						"A movement cannot be filed under another shop than its variant.",
						400,
					);
				}
				return data;
			},
		],
		beforeDelete: [
			async () => {
				throw new APIError("The stock ledger is append-only.", 400);
			},
		],
	},
	fields: [
		{
			name: "variant",
			type: "relationship",
			relationTo: "product-variants",
			required: true,
			index: true,
		},
		{
			name: "product",
			type: "relationship",
			relationTo: "products",
			index: true,
		},
		shopField({ required: true, picker: false }),
		{
			name: "type",
			type: "select",
			required: true,
			index: true,
			options: MOVEMENT_TYPES.map((value) => ({ label: value, value })),
		},
		{ name: "quantity", type: "number", required: true },
		{ name: "unitCost", type: "number", min: 0 },
		{ name: "stockAfter", type: "number", required: true },
		{ name: "note", type: "text", maxLength: 500 },
		{ name: "actor", type: "relationship", relationTo: "users" },
		{ name: "orderRef", type: "text" },
	],
	timestamps: true,
};
