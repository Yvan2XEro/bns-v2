import type { ShopRole } from "~/types";

/**
 * The purchase cost is a shop secret: the API keeps it off every answer to a
 * member who cannot manage the shop, and ignores it on a write from one.
 *
 * Mirrors `canManageShop` in `packages/api/src/access/shopRoles.ts`, which
 * stays the authority — this only decides whether a screen offers a field
 * whose value the server would refuse to store.
 */
export function canSeeCost(role: ShopRole | null | undefined): boolean {
	return role === "owner" || role === "manager";
}

/**
 * The page address (handle) and closing the shop are owner-only levers:
 * `changeShopHandle` and `closeShop` on the API both require it, so the UI
 * hides the control rather than offering one the server would refuse.
 */
export function isShopOwner(role: ShopRole | null | undefined): boolean {
	return role === "owner";
}
