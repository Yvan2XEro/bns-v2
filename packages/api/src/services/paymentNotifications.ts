import { relationId } from "../lib/relationId";
import type { Shop } from "../payload-types";
import { isNotificationProviderConfigured } from "./notificationProvider";

type Value = string | number | boolean | null;
type ShopRef = Pick<Shop, "id" | "name" | "owner">;

async function trigger(
	event: string,
	subscriberId: string | null,
	payload: Record<string, Value>,
) {
	if (!subscriberId || !isNotificationProviderConfigured()) return;
	const { triggerNotificationEvent } = await import(
		"../hooks/notificationEvents"
	);
	await triggerNotificationEvent({ event, subscriberId, payload });
}

export interface PayoutHoldNotice {
	holdId: string;
	scope: "shop" | "order";
	orderId: string | null;
	/** The category, never the reason: the owner must not learn the fraud rule. */
	category: "security" | "review" | "operations";
	cause: "released" | "expired";
}

export async function notifyPayoutHoldReleased(
	shop: ShopRef,
	notice: PayoutHoldNotice,
) {
	await trigger("payout-hold-released", relationId(shop.owner), {
		shopId: String(shop.id),
		shopName: String(shop.name ?? ""),
		holdId: notice.holdId,
		scope: notice.scope,
		orderId: notice.orderId,
		category: notice.category,
		cause: notice.cause,
	});
}
