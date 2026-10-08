import type { PayloadRequest } from "payload";
import type { ShopRole } from "../../access/shopRoles";
import { getOrderSettings } from "../../lib/orderSettings";
import type { Order, OrderEvent } from "../../payload-types";
import { issueHandoverCode } from "./handover";
import { loadOrderItemsFor } from "./orderItems";
import { applyTransition } from "./transitions";

function localeOf(order: Order): "fr" | "en" {
	return order.contract?.locale === "en" ? "en" : "fr";
}

function readyForPickupLabel(locale: "fr" | "en"): string {
	return locale === "fr" ? "Prêt pour le retrait" : "Ready for pickup";
}

export async function shipAcceptedOrderInTransaction(
	req: PayloadRequest,
	order: Order,
	actor: {
		actorType: NonNullable<OrderEvent["actorType"]>;
		actor?: string;
		actorShopRole?: ShopRole;
	},
): Promise<{ order: Order; event: OrderEvent }> {
	const items = await loadOrderItemsFor(req, String(order.id));
	const settings = await getOrderSettings(req.payload);
	const now = new Date();
	const staleAt = new Date(
		now.getTime() + settings.staleShippedDays * 86_400_000,
	).toISOString();
	const transition = await applyTransition(
		req,
		order,
		{
			status: "shipped",
			items: { ids: items.map((item) => String(item.id)), to: "shipped" },
			set: {
				deadlines: { ...order.deadlines, staleAt },
				timestamps: { ...order.timestamps, shippedAt: now.toISOString() },
				...(order.delivery.method === "pickup"
					? {
							delivery: {
								...order.delivery,
								etaText: readyForPickupLabel(localeOf(order)),
							},
						}
					: {}),
			},
		},
		{
			type: "order.shipped",
			actorType: actor.actorType,
			actor: actor.actor ?? null,
			actorShopRole: actor.actorShopRole ?? null,
			visibility: "both",
		},
	);
	await issueHandoverCode(req, transition.order, { regenerate: false });
	return transition;
}
