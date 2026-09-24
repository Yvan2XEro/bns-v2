import type {
	Access,
	FieldAccess,
	Payload,
	PayloadRequest,
	RelationshipField,
	Where,
} from "payload";
import { relationId } from "../lib/relationId";
import { isModerator } from "./roles";

export const SHOP_ROLES = ["owner", "manager", "staff"] as const;
export type ShopRole = (typeof SHOP_ROLES)[number];

const ROLE_CACHE = "shopRoleCache";
const MEMBER_CACHE = "memberShopIds";

/**
 * The caller's active role in a shop, or null. P3 adds suspension, shop-status
 * and dormant-team rules here without changing the signature.
 */
export async function resolveShopRole(
	payload: Payload,
	userId: string | null | undefined,
	shopId: string | null | undefined,
	context?: Record<string, unknown>,
): Promise<ShopRole | null> {
	if (!userId || !shopId) return null;

	let cache: Record<string, ShopRole | null> | null = null;
	if (context) {
		context[ROLE_CACHE] ??= {};
		cache = context[ROLE_CACHE] as Record<string, ShopRole | null>;
	}
	const key = `${userId}:${shopId}`;
	if (cache && key in cache) return cache[key];

	const result = await payload.find({
		collection: "shop-members",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ user: { equals: userId } },
				{ status: { equals: "active" } },
			],
		},
	});

	const role = (result.docs[0]?.role as ShopRole | undefined) ?? null;
	if (cache) cache[key] = role;
	return role;
}

export function canManageShop(role: ShopRole | null | undefined): boolean {
	return role === "owner" || role === "manager";
}

/**
 * Field-level access for a shop-owned document: resolves the caller's role in
 * the field's shop and lets `allow` decide from it. `cost` (manage-only) and
 * the stock counters (any active member) are both just this with a different
 * predicate, so neither field re-implements "resolve role, then decide".
 */
export function shopRoleFieldAccess(
	allow: (role: ShopRole | null) => boolean,
	fieldName = "shop",
): FieldAccess {
	return async ({ req, doc }) => {
		if (!req.user) return false;
		if (isModerator(req.user)) return true;
		const role = await resolveShopRole(
			req.payload,
			String(req.user.id),
			relationId((doc as Record<string, unknown> | undefined)?.[fieldName]),
			req.context,
		);
		return allow(role);
	};
}

/** Shops where the caller holds an active membership; used by access `Where`s. */
export async function memberShopIds(
	req: PayloadRequest,
	options: { manage?: boolean } = {},
): Promise<string[]> {
	const userId = relationId(req.user);
	if (!userId) return [];

	req.context ??= {};
	const context = req.context as Record<string, unknown>;
	let rows = context[MEMBER_CACHE] as
		| Array<{ shop: string; role: ShopRole }>
		| undefined;

	if (!rows) {
		const result = await req.payload.find({
			collection: "shop-members",
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
			where: {
				and: [{ user: { equals: userId } }, { status: { equals: "active" } }],
			},
		});
		rows = result.docs
			.map((doc) => ({
				shop: relationId(doc.shop) ?? "",
				role: doc.role as ShopRole,
			}))
			.filter((row) => row.shop);
		context[MEMBER_CACHE] = rows;
	}

	return rows
		.filter((row) => !options.manage || canManageShop(row.role))
		.map((row) => row.shop);
}

/**
 * Runs a collection's own access rule, then narrows the result to the caller's
 * shops — so shop-owned collections never repeat the member-scoping body.
 * A `false` short-circuits: narrowing cannot widen a refusal.
 */
export function withShopAccess(
	base: Access,
	fieldName = "shop",
	options: { manage?: boolean } = {},
): Access {
	return async (args) => {
		const result = await base(args);
		if (result === false) return false;
		const scope = {
			[fieldName]: { in: await memberShopIds(args.req, options) },
		} as Where;
		return result === true ? scope : ({ and: [result, scope] } as Where);
	};
}

/**
 * Read access for a shop-owned collection: staff read everything, a member
 * reads every row of their shops on top of whatever `base` exposes publicly.
 * The union twin of `withShopAccess`, which intersects — both exist so no
 * collection repeats the member-scoping `where`.
 */
export function shopScopedRead(base: Access, fieldName = "shop"): Access {
	return async (args) => {
		if (isModerator(args.req.user)) return true;
		const result = await base(args);
		if (result === true) return true;
		if (!relationId(args.req.user)) return result;
		const scope = {
			[fieldName]: { in: await memberShopIds(args.req) },
		} as Where;
		return result === false ? scope : ({ or: [result, scope] } as Where);
	};
}

/**
 * The one `shop` relationship definition. `filterOptions` scopes the admin
 * picker to the caller's shops; access control stays in `withShopAccess`.
 *
 * `picker: false` drops `filterOptions`: Payload validates it on every write,
 * so a collection a service writes on behalf of someone who is not a member
 * (moderation, a buyer's order) cannot carry it.
 */
export function shopField(
	overrides: { name?: string; required?: boolean; picker?: boolean } = {},
): RelationshipField {
	const { picker = true, ...rest } = overrides;
	return {
		name: "shop",
		type: "relationship",
		relationTo: "shops",
		index: true,
		...(picker
			? {
					filterOptions: async ({ req }: { req: PayloadRequest }) => ({
						id: { in: await memberShopIds(req) },
					}),
				}
			: {}),
		...rest,
	};
}
