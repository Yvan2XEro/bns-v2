import type { Payload } from "payload";
import { SHOP_SERVICE_CONTEXT } from "../collections/Shops";
import { triggerNotificationEvent } from "../hooks/notificationEvents";
import { weekBoundsDouala } from "../lib/orderMath";
import { recipientsForShop } from "./orders/notifications";
import { getShopInsights } from "./shopInsights";

const PAGE_SIZE = 200;
const MIN_WEEKLY_VIEWS = 50;

export const WEEKLY_INSIGHTS_EVENT = "shop-weekly-insights";

/** What the `shop-weekly-insights` workflow receives; `payloadSchema` mirrors it. */
export interface WeeklyInsightsPayload {
	shopId: string;
	from: string;
	to: string;
	gmvDelivered: number;
	ordersPlaced: number;
	ordersDelivered: number;
	responseTime: string;
	topAction: string;
	topActionHref: string;
}

/**
 * Monday 07:00 UTC: one weekly summary per shop to the members who can read
 * insights, for shops with an order or 50 views in the seven days. The
 * Douala week's start is the stamp on the shop, written before the send so a
 * retried run never doubles a notice.
 */
export async function sendWeeklyInsights(
	payload: Payload,
	now: Date = new Date(),
): Promise<{ shops: string[]; recipients: number }> {
	const settings = await payload
		.findGlobal({ slug: "app-settings", depth: 0, overrideAccess: true })
		.catch(() => null);
	if (settings?.insights?.enabled !== true) return { shops: [], recipients: 0 };

	const stamp = weekBoundsDouala(now).periodStart;
	const shops: string[] = [];
	let recipients = 0;
	for (let page = 1; ; page += 1) {
		const batch = await payload.find({
			collection: "shops",
			where: { status: { equals: "active" } },
			sort: "id",
			page,
			limit: PAGE_SIZE,
			depth: 0,
			overrideAccess: true,
		});
		for (const shop of batch.docs) {
			if (shop.weeklyInsightsSentFor === stamp) continue;
			const shopId = String(shop.id);
			const members = await recipientsForShop(payload, shopId, "costs.view");
			const [first] = members;
			if (!first) continue;
			const view = await getShopInsights(payload, { id: first }, shopId, "7d", {
				now,
			});
			const current = view.totals.current;
			if (current.ordersPlaced < 1 && current.views < MIN_WEEKLY_VIEWS) {
				continue;
			}
			await payload.update({
				collection: "shops",
				id: shopId,
				context: SHOP_SERVICE_CONTEXT,
				overrideAccess: true,
				data: { weeklyInsightsSentFor: stamp },
			});
			const top = view.actions[0];
			const body: WeeklyInsightsPayload = {
				shopId,
				from: view.from,
				to: view.to,
				gmvDelivered: current.gmvDelivered,
				ordersPlaced: current.ordersPlaced,
				ordersDelivered: current.ordersDelivered,
				responseTime: view.responseTime.medianBucket ?? "none",
				topAction: top?.type ?? "none",
				topActionHref: top?.href ?? "/seller/insights",
			};
			for (const subscriberId of members) {
				await triggerNotificationEvent({
					event: WEEKLY_INSIGHTS_EVENT,
					subscriberId,
					payload: { ...body },
				});
				recipients += 1;
			}
			shops.push(shopId);
		}
		if (!batch.hasNextPage) break;
	}
	return { shops, recipients };
}
