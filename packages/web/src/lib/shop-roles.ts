import type { ShopRole } from "~/types";

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
 * Mirrors `ROLE_PERMISSIONS` in `packages/api/src/access/shopRoles.ts`, which
 * stays the authority. This copy exists so a screen can hide a control the
 * server would refuse rather than offering it and showing an error; the test
 * beside this file transcribes the same table the API's own test does, so a
 * divergence fails a test instead of shipping.
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
