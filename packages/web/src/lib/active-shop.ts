import { can } from "~/lib/shop-roles";
import type { MyShopsEntry, ShopRole, TeamMemberView, TeamView } from "~/types";

/** Read by the seller layout on the server and written by the switcher. */
export const ACTIVE_SHOP_COOKIE = "bns_active_shop";

/** `GET /api/shops/mine` honours a preferred shop only among the caller's own memberships. */
export function myShopPath(preferredShopId: string | null): string {
	return preferredShopId
		? `/api/shops/mine?shopId=${encodeURIComponent(preferredShopId)}`
		: "/api/shops/mine";
}

export function readActiveShopCookie(
	cookieHeader: string | null = typeof document === "undefined"
		? null
		: document.cookie,
): string | null {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name === ACTIVE_SHOP_COOKIE) {
			try {
				return decodeURIComponent(rest.join("=")) || null;
			} catch {
				return null;
			}
		}
	}
	return null;
}

/**
 * Where the switcher lands after changing shop: the same section of the
 * seller space, without a record id that belonged to the previous shop.
 */
export function switchShopTarget(pathname: string): string {
	const path = `/${pathname.split("?")[0].split("/").filter(Boolean).join("/")}`;
	if (path !== "/seller" && !path.startsWith("/seller/")) return "/seller";
	for (const [prefix, landing] of SHOP_SCOPED_DETAILS) {
		if (path === landing || path === `${prefix}/new`) continue;
		if (path === prefix || path.startsWith(`${prefix}/`)) return landing;
	}
	return path;
}

/** Routes whose child segment is a record of one shop, and where to land instead. */
const SHOP_SCOPED_DETAILS: [string, string][] = [
	["/seller/catalogue", "/seller/catalogue"],
	["/seller/orders", "/seller/orders"],
	["/seller/returns", "/seller/returns"],
	["/seller/disputes", "/seller/disputes"],
	["/seller/billing", "/seller/billing"],
	["/seller/payments/payouts", "/seller/payments"],
	["/seller/resale/purchase-orders", "/seller/resale/purchase-orders"],
	["/seller/resale/products", "/seller/resale"],
	["/seller/verification/identity/return", "/seller/verification"],
];

/**
 * A cookie can name a shop the caller has since left or been removed from, so
 * it is a preference, never an authority: the list comes from
 * `GET /api/me/shops`, and anything not in it is ignored.
 */
export function resolveActiveShop(
	shops: MyShopsEntry[],
	cookieValue: string | null,
): MyShopsEntry | null {
	if (shops.length === 0) return null;
	const preferred = cookieValue
		? shops.find((entry) => entry.shopId === cookieValue)
		: undefined;
	return preferred ?? shops[0];
}

/**
 * Who the assignee picker offers. A staff member holds `inbox.reply` but not
 * `inbox.assignOthers`, so their list is themselves — which the server
 * enforces too; this only stops the UI offering a control that would fail.
 * A suspended member is left out: `inboxMemberIds` would refuse them.
 */
export function assignableMembers(
	team: TeamView | undefined,
	callerRole: ShopRole | null | undefined,
	callerId: string,
): TeamMemberView[] {
	const members = (team?.members ?? []).filter((member) => !member.suspended);
	if (can(callerRole, "inbox.assignOthers")) return members;
	return members.filter((member) => member.userId === callerId);
}
