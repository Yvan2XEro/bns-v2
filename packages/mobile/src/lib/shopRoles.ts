import type { ShopRole } from "../types/api";

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
 * Display-only mirror of `ROLE_PERMISSIONS` in `packages/api/src/access/shopRoles.ts`.
 * The server stays the sole authority for every write; this decides only
 * whether a screen offers a tile or a control at all, so a staff member never
 * taps into a 403. `packages/api/tests/int/shop-permissions-parity.int.spec.ts`
 * imports this table (and web's) alongside the API's own and diffs them at
 * runtime, so a divergence from the server fails a test instead of shipping.
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

/** Kept for screens that gate cost visibility; mirrors web's `canSeeCost`. */
export function canSeeCost(role: ShopRole | null | undefined): boolean {
	return can(role, "costs.view");
}

export type MatrixArea =
	| "catalogue"
	| "stock"
	| "costs"
	| "orders"
	| "payments"
	| "team";
export type MatrixCell = "full" | "view" | "none";

/** Each area's acting permission, and the read-only one when there is a lesser level. */
const MATRIX_AREAS: ReadonlyArray<{
	area: MatrixArea;
	act: ShopPermission;
	view?: ShopPermission;
}> = [
	{ area: "catalogue", act: "catalogue.edit" },
	{ area: "stock", act: "stock.move" },
	{ area: "costs", act: "costs.edit", view: "costs.view" },
	{ area: "orders", act: "orders.process", view: "orders.view" },
	{ area: "payments", act: "payments.manage", view: "payments.view" },
	{ area: "team", act: "team.inviteStaff", view: "team.view" },
];

export const MATRIX_ROLES: readonly ShopRole[] = ["owner", "manager", "staff"];

/** The "who can do what" table, read from `ROLE_PERMISSIONS` so it can never drift from it. */
export function roleMatrix(): { area: MatrixArea; cells: MatrixCell[] }[] {
	return MATRIX_AREAS.map(({ area, act, view }) => ({
		area,
		cells: MATRIX_ROLES.map((role) =>
			can(role, act) ? "full" : view && can(role, view) ? "view" : "none",
		),
	}));
}
