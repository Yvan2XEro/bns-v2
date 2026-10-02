import { APIError, type CollectionConfig, type RequestContext } from "payload";
import { isAdmin } from "../access/roles";
import {
	can,
	shopField,
	shopRoleFieldAccess,
	shopScopedRead,
} from "../access/shopRoles";
import { relationId } from "../lib/relationId";

/**
 * A module-private symbol, not a context flag: `req.context` reaching the API
 * from outside is JSON, and JSON has no symbol keys, so only code that can
 * import this module can claim a variant is already loaded.
 */
const LOADED_VARIANT = Symbol("stock-movements.loadedVariant");

export interface LoadedVariant {
	id: string | number;
	shop?: unknown;
}

/**
 * Lets services/stock.ts hand the hook the variant it just read, so appending a
 * movement costs one read instead of two. The shop check below still runs — the
 * service only saves the lookup, it does not skip the guard.
 */
export function trustLoadedVariant(
	context: RequestContext,
	variant: LoadedVariant,
): void {
	Reflect.set(context, LOADED_VARIANT, variant);
}

function loadedVariant(
	context: RequestContext | undefined,
	variantId: string,
): LoadedVariant | null {
	if (!context) return null;
	const raw: unknown = Reflect.get(context, LOADED_VARIANT);
	if (!raw || typeof raw !== "object") return null;
	const candidate = raw as LoadedVariant;
	// A stale entry from an earlier append in the same request is ignored.
	return relationId(candidate.id) === variantId ? candidate : null;
}

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
				const variant =
					loadedVariant(req.context, variantId) ??
					(await req.payload
						.findByID({
							collection: "product-variants",
							id: variantId,
							depth: 0,
							overrideAccess: true,
							req,
						})
						.catch(() => null));
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
		{
			name: "unitCost",
			type: "number",
			min: 0,
			// A shop secret, same predicate as `product-variants.cost`. The
			// service redacts it for `listMovements` on top of this
			// (`redactCost: !can(role, "costs.view")`), but the raw REST
			// collection needs the same gate: latent while P1 creates owner rows
			// only, live the moment a manager or staff membership exists.
			access: { read: shopRoleFieldAccess((role) => can(role, "costs.view")) },
		},
		{ name: "stockAfter", type: "number", required: true },
		{ name: "note", type: "text", maxLength: 500 },
		{ name: "actor", type: "relationship", relationTo: "users" },
		{ name: "orderRef", type: "text" },
		{ name: "order", type: "relationship", relationTo: "orders", index: true },
		{ name: "reservedAfter", type: "number" },
	],
	timestamps: true,
};
