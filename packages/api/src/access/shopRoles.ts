import type {
	Access,
	FieldAccess,
	Payload,
	PayloadRequest,
	RelationshipField,
	Where,
} from "payload";
import { relationId } from "../lib/relationId";
import { shopCapabilities } from "../lib/shopCapabilities";
import { isModerator, isSuspended, type SuspendableUser } from "./roles";

export const SHOP_ROLES = ["owner", "manager", "staff"] as const;
export type ShopRole = (typeof SHOP_ROLES)[number];

export type ShopPermission =
	| "catalogue.edit"
	| "catalogue.archive"
	| "stock.move"
	| "costs.view"
	| "costs.edit"
	| "orders.view"
	| "orders.process"
	| "orders.cancel"
	| "inbox.reply"
	| "inbox.assignOthers"
	| "payments.view"
	| "payments.manage"
	| "team.view"
	| "team.inviteStaff"
	| "team.manageManagers"
	| "settings.edit"
	| "settings.handle"
	| "verification.submit"
	| "resale.manage"
	| "activity.view"
	| "shop.close";

/**
 * P4 enforces the order permissions, P5 the payment ones and P8 `resale.manage`;
 * they are named here so the matrix is one table rather than three that drift.
 */
export const ROLE_PERMISSIONS: Record<ShopRole, readonly ShopPermission[]> = {
	owner: [
		"catalogue.edit",
		"catalogue.archive",
		"stock.move",
		"costs.view",
		"costs.edit",
		"orders.view",
		"orders.process",
		"orders.cancel",
		"inbox.reply",
		"inbox.assignOthers",
		"payments.view",
		"payments.manage",
		"team.view",
		"team.inviteStaff",
		"team.manageManagers",
		"settings.edit",
		"settings.handle",
		"verification.submit",
		"resale.manage",
		"activity.view",
		"shop.close",
	],
	manager: [
		"catalogue.edit",
		"catalogue.archive",
		"stock.move",
		"costs.view",
		"costs.edit",
		"orders.view",
		"orders.process",
		"orders.cancel",
		"inbox.reply",
		"inbox.assignOthers",
		"payments.view",
		"team.view",
		"team.inviteStaff",
		"settings.edit",
		"resale.manage",
		"activity.view",
	],
	staff: [
		"catalogue.edit",
		"stock.move",
		"orders.view",
		"orders.process",
		"inbox.reply",
		"team.view",
	],
};

export const SHOP_PERMISSIONS: readonly ShopPermission[] =
	ROLE_PERMISSIONS.owner;

const PERMISSION_SETS: Record<ShopRole, ReadonlySet<ShopPermission>> = {
	owner: new Set(ROLE_PERMISSIONS.owner),
	manager: new Set(ROLE_PERMISSIONS.manager),
	staff: new Set(ROLE_PERMISSIONS.staff),
};

export function can(
	role: ShopRole | null | undefined,
	permission: ShopPermission,
): boolean {
	if (!role) return false;
	return PERMISSION_SETS[role]?.has(permission) ?? false;
}

/**
 * Kept as the name a hundred call sites already use. "Manage" has always meant
 * exactly the settings-editing set, which is what the matrix now calls it.
 */
export function canManageShop(role: ShopRole | null | undefined): boolean {
	return can(role, "settings.edit");
}

const ROLE_CACHE = "shopRoleCache";
const MEMBER_CACHE = "memberShopIds";
const SHOP_CACHE = "shopStateCache";
const SUSPENSION_CACHE = "userSuspensionCache";

type ShopState = {
	status: string;
	level?: number | null;
	levelExpiresAt?: string | null;
};

/**
 * `shopRoleFieldAccess` runs once per document, and a listing page populates
 * dozens. Without these two caches P3's shop and suspension lookups would turn
 * every such page into an N+1 against `shops` and `users`.
 */
async function shopState(
	payload: Payload,
	shopId: string,
	context: Record<string, unknown> | undefined,
): Promise<ShopState | null> {
	let cache: Record<string, ShopState | null> | null = null;
	if (context) {
		context[SHOP_CACHE] ??= {};
		cache = context[SHOP_CACHE] as Record<string, ShopState | null>;
	}
	if (cache && shopId in cache) return cache[shopId];

	const shop = await payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
			select: { status: true, level: true, levelExpiresAt: true },
		})
		.catch(() => null);
	const state = shop
		? {
				status: String(shop.status),
				level: shop.level ?? null,
				levelExpiresAt: (shop.levelExpiresAt as string | null) ?? null,
			}
		: null;
	if (cache) cache[shopId] = state;
	return state;
}

async function userSuspended(
	payload: Payload,
	userId: string,
	context: Record<string, unknown> | undefined,
): Promise<boolean> {
	let cache: Record<string, boolean> | null = null;
	if (context) {
		context[SUSPENSION_CACHE] ??= {};
		cache = context[SUSPENSION_CACHE] as Record<string, boolean>;
	}
	if (cache && userId in cache) return cache[userId];

	const user = await payload
		.findByID({
			collection: "users",
			id: userId,
			depth: 0,
			overrideAccess: true,
			select: { suspendedAt: true, suspendedUntil: true },
		})
		.catch(() => null);
	const suspended = user ? isSuspended(user as SuspendableUser) : false;
	if (cache) cache[userId] = suspended;
	return suspended;
}

/**
 * The caller's usable role in a shop, or null.
 *
 * The owner is exempt from the last three conditions on purpose: P1's
 * suspension banner and P2's verification hub are the owner's only way back
 * out of a suspended or dormant shop, and a null role there would blank the
 * screen that explains the problem. Writes stay refused by the `shop.inactive`
 * checks in `requireShopPermission`.
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

	const role = await computeShopRole(payload, userId, shopId, context);
	if (cache) cache[key] = role;
	return role;
}

async function computeShopRole(
	payload: Payload,
	userId: string,
	shopId: string,
	context: Record<string, unknown> | undefined,
): Promise<ShopRole | null> {
	const result = await payload.find({
		collection: "shop-members",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		where: {
			and: [{ shop: { equals: shopId } }, { user: { equals: userId } }],
		},
	});

	const row = result.docs[0];
	if (!row || row.status !== "active") return null;
	const role = row.role as ShopRole;
	if (role === "owner") return role;

	if (await userSuspended(payload, userId, context)) return null;

	const shop = await shopState(payload, shopId, context);
	if (!shop || shop.status !== "active") return null;
	if (!shopCapabilities(shop).teamMembers) return null;

	return role;
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
	options: { manage?: boolean; permission?: ShopPermission } = {},
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
		const candidates = result.docs
			.map((doc) => ({
				shop: relationId(doc.shop) ?? "",
				role: doc.role as ShopRole,
			}))
			.filter((row) => row.shop);

		// Same four conditions as `resolveShopRole`, applied here too: this list
		// is what `Shops.access.update` and `shopScopedRead` narrow on, and a
		// dormant or suspended member must not keep write access through them.
		const usable: Array<{ shop: string; role: ShopRole }> = [];
		for (const row of candidates) {
			const role = await resolveShopRole(
				req.payload,
				userId,
				row.shop,
				context,
			);
			if (role) usable.push({ shop: row.shop, role });
		}
		rows = usable;
		context[MEMBER_CACHE] = rows;
	}

	const permission =
		options.permission ?? (options.manage ? "settings.edit" : null);
	return rows
		.filter((row) => !permission || can(row.role, permission))
		.map((row) => row.shop);
}

/**
 * Read access for a shop-owned collection: staff read everything, a member
 * reads every row of their shops on top of whatever `base` exposes publicly —
 * it unions the member scope onto `base` rather than narrowing it, which is
 * what every shop-owned collection actually needs.
 *
 * `allow` narrows that member scope to a permission rather than plain
 * membership — `shop-activity-log` gates its read on `activity.view` rather
 * than "any active member", since a staff member sees the shop but not who
 * changed what in it.
 *
 * `moderatorScope` narrows a moderator's own access the same way `allow`
 * narrows a member's: a moderator still sees every shop (the row-level
 * bypass below is unconditional on the shop), but a collection whose rows
 * can carry something a moderator has no business reading — the cost figures
 * `shop-activity-log` keeps in `metadata` — passes a `Where` that excludes
 * those rows outright. A bare `true` here would let the collection endpoint
 * hand a moderator exactly what a route-level strip (built for the same
 * reason) was written to keep from them.
 */
export function shopScopedRead(
	base: Access,
	fieldName = "shop",
	allow?: (role: ShopRole | null) => boolean,
	moderatorScope?: Where,
): Access {
	return async (args) => {
		if (isModerator(args.req.user)) return moderatorScope ?? true;
		const result = await base(args);
		if (result === true) return true;
		if (!relationId(args.req.user)) return result;
		const ids = allow
			? await permittedShopIds(args.req, allow)
			: await memberShopIds(args.req);
		const scope = { [fieldName]: { in: ids } } as Where;
		return result === false ? scope : ({ or: [result, scope] } as Where);
	};
}

/** `memberShopIds` narrowed by an arbitrary predicate, reusing its cache. */
async function permittedShopIds(
	req: PayloadRequest,
	allow: (role: ShopRole | null) => boolean,
): Promise<string[]> {
	await memberShopIds(req);
	const rows = (req.context as Record<string, unknown>)[MEMBER_CACHE] as
		| Array<{ shop: string; role: ShopRole }>
		| undefined;
	return (rows ?? []).filter((row) => allow(row.role)).map((row) => row.shop);
}

/**
 * The one `shop` relationship definition. `filterOptions` scopes the admin
 * picker to the caller's shops; access control stays in each collection's own
 * `access.read` (typically `shopScopedRead`) and `shopRoleFieldAccess`.
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
