import { can } from "~/lib/shop-roles";
import type { MyShopsEntry, ShopRole, TeamMemberView, TeamView } from "~/types";

/** Read by the seller layout on the server and written by the switcher. */
export const ACTIVE_SHOP_COOKIE = "bns_active_shop";

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
