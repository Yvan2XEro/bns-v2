import type {
	MyShopsEntry,
	ShopRole,
	TeamMemberView,
	TeamView,
} from "../types/api";
import { can } from "./shopRoles";

/**
 * AsyncStorage key the seller space reads to remember which shop is active
 * across launches — mobile's twin of a cookie, since there is no server
 * session to carry it.
 */
export const ACTIVE_SHOP_STORAGE_KEY = "bns.activeShopId";

/**
 * Picks the shop the seller space opens into: the previously stored one if
 * the caller still belongs to it, else the first shop in the list
 * (deterministic — never "whichever request resolved last"), else `null`
 * when the caller belongs to no shop at all.
 */
export function resolveActiveShop(
	shops: MyShopsEntry[],
	storedId: string | null,
): MyShopsEntry | null {
	if (storedId) {
		const stored = shops.find((shop) => shop.shopId === storedId);
		if (stored) return stored;
	}
	return shops[0] ?? null;
}

/**
 * The assignee sheet's candidate list. A caller holding `inbox.assignOthers`
 * (owner, manager) can hand a conversation to any active member; a caller
 * without it (staff) can only act on themselves, so the sheet falls back to
 * "Assign to me" / "Unassign" rather than a member list. A suspended member
 * is never offered as a *new* target, even to a manager — the server
 * deliberately keeps their existing assignment rather than clearing it, so a
 * suspended assignee stays visible elsewhere, just not reachable here.
 */
export function assignableMembers(
	team: TeamView | undefined,
	callerRole: ShopRole | null,
	callerId: string,
): TeamMemberView[] {
	if (!team) return [];
	const active = team.members.filter((member) => !member.suspended);
	if (can(callerRole, "inbox.assignOthers")) return active;
	const self = active.find((member) => member.userId === callerId);
	return self ? [self] : [];
}
