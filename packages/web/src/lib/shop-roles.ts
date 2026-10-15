import type { ShopRole } from "../types";

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
 * Display-only mirror of `ROLE_PERMISSIONS` in
 * `packages/api/src/access/shopRoles.ts`, which stays the sole authority for
 * every write. This copy exists so a screen can hide a control the server
 * would refuse rather than offering it and showing an error.
 * `packages/api/tests/int/shop-permissions-parity.int.spec.ts` imports this
 * table (and mobile's) alongside the API's own and diffs them at runtime, so
 * a divergence from the server fails a test instead of shipping — the test
 * beside this file only catches this copy drifting from its own local test.
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

const SETS: Record<ShopRole, ReadonlySet<ShopPermission>> = {
	owner: new Set(ROLE_PERMISSIONS.owner),
	manager: new Set(ROLE_PERMISSIONS.manager),
	staff: new Set(ROLE_PERMISSIONS.staff),
};

/**
 * Asks the same question the server does — never re-derives it. A screen
 * uses this to decide whether to *show* a control (hide a menu item, disable
 * a button); the server's answer on the actual write is still authoritative,
 * and this function must never be treated as a substitute for it. P1 shipped
 * a reviewer who saw actions the server would refuse, and P2 shipped a badge
 * computed from a stale field — both were a client inferring status instead
 * of reading the capability the API states. This table exists only to avoid
 * offering a control the server has already told us (via the matrix it also
 * owns) it would reject.
 */
export function can(
	role: ShopRole | null | undefined,
	permission: ShopPermission,
): boolean {
	if (!role) return false;
	return SETS[role]?.has(permission) ?? false;
}

/** Kept for the catalogue and stock screens that already call it. */
export function canSeeCost(role: ShopRole | null | undefined): boolean {
	return can(role, "costs.view");
}

/**
 * Still a role check, not a permission: the handle and closing are
 * `settings.handle` and `shop.close`, but several screens ask the plainer
 * question "is this person the owner".
 */
export function isShopOwner(role: ShopRole | null | undefined): boolean {
	return role === "owner";
}

export type MatrixArea =
	| "catalogue"
	| "stock"
	| "costs"
	| "orders"
	| "inbox"
	| "payments"
	| "team"
	| "settings";
export type MatrixCell = "full" | "limited" | "none";

/** Each area's full permission, and the lesser one that counts as limited access. */
const MATRIX_AREAS: ReadonlyArray<{
	area: MatrixArea;
	full: ShopPermission;
	limited?: ShopPermission;
}> = [
	{ area: "catalogue", full: "catalogue.archive", limited: "catalogue.edit" },
	{ area: "stock", full: "stock.move" },
	{ area: "costs", full: "costs.edit", limited: "costs.view" },
	{ area: "orders", full: "orders.cancel", limited: "orders.process" },
	{ area: "inbox", full: "inbox.assignOthers", limited: "inbox.reply" },
	{ area: "payments", full: "payments.manage", limited: "payments.view" },
	{ area: "team", full: "team.manageManagers", limited: "team.inviteStaff" },
	{ area: "settings", full: "settings.handle", limited: "settings.edit" },
];

export const MATRIX_ROLES: readonly ShopRole[] = ["owner", "manager", "staff"];

/** The roles-and-permissions table, read from the role table so it can never drift from it. */
export function roleMatrix(): { area: MatrixArea; cells: MatrixCell[] }[] {
	return MATRIX_AREAS.map(({ area, full, limited }) => ({
		area,
		cells: MATRIX_ROLES.map((role) =>
			can(role, full)
				? "full"
				: limited && can(role, limited)
					? "limited"
					: "none",
		),
	}));
}
