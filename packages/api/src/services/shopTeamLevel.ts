import type { PayloadRequest } from "payload";
import { queueMembershipChange } from "../hooks/membershipEvents";
import { relationId } from "../lib/relationId";
import { shopCapabilities } from "../lib/shopCapabilities";
import { commitContextOf, onCommit } from "../lib/transactions";
import { notifyShopTeamPaused } from "./shopMemberNotifications";
import { pauseShopTeam, resumeShopTeam } from "./shopMembers";
import { onShopLevelChangedOnce, type ShopLevelChange } from "./shops";

/**
 * A shop that drops below level 2 loses its team capability. Memberships are
 * NOT revoked: `resolveShopRole` already returns null for non-owners of a
 * dormant shop, so access goes away without destroying a roster the owner
 * gets back the moment they re-verify. Pending invitations do go, because a
 * link sitting in someone's inbox would otherwise let them join a team that
 * no longer exists.
 */
export async function handleShopLevelChange(
	req: PayloadRequest,
	event: ShopLevelChange,
): Promise<void> {
	const shop = await req.payload
		.findByID({
			collection: "shops",
			id: event.shopId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	if (!shop) return;

	const before = shopCapabilities({
		status: shop.status,
		level: event.previousLevel,
		levelExpiresAt: null,
	}).teamMembers;
	const after = shopCapabilities(shop).teamMembers;
	if (before === after) return;

	if (!after) {
		const paused = await pauseShopTeam(req, event.shopId);
		// No removed ids: the memberships still exist, so chat-service refetches
		// the inbox-members set and evicts whoever is no longer in it.
		await queueMembershipChange(commitContextOf(req), event.shopId);
		const ownerId = relationId(shop.owner);
		if (ownerId) {
			const work = () =>
				notifyShopTeamPaused({
					shopId: event.shopId,
					shopName: String(shop.name),
					ownerId,
					memberIds: paused,
				});
			if (!onCommit(commitContextOf(req), work)) await work();
		}
		return;
	}

	await resumeShopTeam(req, event.shopId);
	await queueMembershipChange(commitContextOf(req), event.shopId);
}

/**
 * Idempotent, and idempotent against `__resetShopLevelListeners()` too: a
 * module-level `registered` flag would go on claiming a registration the test
 * helper had just emptied, so the guard asks the registry itself.
 */
export function registerShopTeamLevelListener(): () => void {
	return onShopLevelChangedOnce(handleShopLevelChange);
}
