import type { Payload, PayloadRequest } from "payload";
import { triggerNotificationEvent } from "../../hooks/notificationEvents";
import { relationId } from "../../lib/relationId";
import { commitContextOf, onCommit } from "../../lib/transactions";
import type { Order, Shipment } from "../../payload-types";
import { recipientsForShop } from "../orders/notifications";
import { sendSms } from "../smsProvider";

type NotificationValues = Record<string, string | number | boolean | null>;

async function notify(
	event: string,
	subscriberId: string,
	values: NotificationValues,
): Promise<void> {
	await triggerNotificationEvent({ event, subscriberId, payload: values });
}

export async function notifyDeliverySettingsIncomplete(
	subscriberId: string,
	shopId: string,
	details: { needsStructuredPickupHours: boolean; noActiveOption: boolean },
): Promise<void> {
	await notify("delivery-settings-incomplete", subscriberId, {
		shopId,
		...details,
	});
}

async function sms(
	payload: Payload,
	order: Order,
	message: string,
): Promise<void> {
	const phone = order.delivery.phone;
	if (!phone) return;
	try {
		await sendSms(payload, { to: phone, message });
	} catch (error) {
		payload.logger.error(
			{ err: error, orderId: String(order.id) },
			"[delivery] notification SMS failed",
		);
	}
}

export async function notifyShipmentAttemptFailed(
	payload: Payload,
	order: Order,
	shipment: Shipment,
	reason: string,
	attemptsLeft: number,
	rescheduleBy: string,
): Promise<void> {
	const orderId = String(order.id);
	const values = {
		orderId,
		shipmentId: String(shipment.id),
		reason,
		attemptsLeft,
		rescheduleBy,
	};
	const buyerId = relationId(order.buyer);
	if (buyerId) {
		await notify("shipment-attempt-failed", buyerId, {
			...values,
			audience: "buyer",
		});
	}
	const shopId = relationId(shipment.fulfillingShop);
	if (shopId) {
		for (const subscriberId of await recipientsForShop(
			payload,
			shopId,
			"orders.view",
		)) {
			await notify("shipment-attempt-failed", subscriberId, {
				...values,
				audience: "shop",
			});
		}
	}
	await sms(
		payload,
		order,
		`Livraison ${order.orderNumber} manquée. Choisissez un nouveau créneau: buynsellem.com/purchases/${orderId}`,
	);
}

export async function notifyShipmentRedeliveryScheduled(
	payload: Payload,
	order: Order,
	shipment: Shipment,
): Promise<void> {
	const orderId = String(order.id);
	const values: NotificationValues = {
		orderId,
		shipmentId: String(shipment.id),
		date: shipment.redelivery?.scheduledFor ?? "",
		window: shipment.redelivery?.window ?? "",
	};
	const subscribers = new Map<string, "shop" | "rider">();
	const shopId = relationId(shipment.fulfillingShop);
	if (shopId) {
		for (const userId of await recipientsForShop(
			payload,
			shopId,
			"orders.view",
		)) {
			subscribers.set(userId, "shop");
		}
	}
	const courierId = relationId(shipment.courier);
	if (courierId) {
		const memberships = await payload.find({
			collection: "courier-members",
			where: {
				and: [
					{ courier: { equals: courierId } },
					{ status: { equals: "active" } },
					{ role: { in: ["dispatcher", "rider"] } },
				],
			},
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
		});
		for (const member of memberships.docs) {
			const userId = relationId(member.user);
			if (userId) subscribers.set(userId, "rider");
		}
	}
	const riderId = relationId(shipment.rider?.user);
	if (riderId) subscribers.set(riderId, "rider");
	for (const [subscriberId, audience] of subscribers) {
		await notify("shipment-redelivery-scheduled", subscriberId, {
			...values,
			audience,
		});
	}
	const date = shipment.redelivery?.scheduledFor ?? "";
	const window = shipment.redelivery?.window ?? "";
	await sms(
		payload,
		order,
		`BuyNSellem: nouvelle tentative de livraison ${order.orderNumber} prévue le ${date} (${window}).`,
	);
}

export async function notifyShipmentReturnInitiated(
	payload: Payload,
	order: Order,
	shipment: Shipment,
	reason: string,
): Promise<void> {
	const shopIds = new Set(
		[shipment.fulfillingShop, shipment.storefrontShop]
			.map((shop) => relationId(shop))
			.filter((shopId): shopId is string => shopId !== null),
	);
	for (const shopId of shopIds) {
		for (const subscriberId of await recipientsForShop(
			payload,
			shopId,
			"orders.view",
		)) {
			await notify("shipment-return-initiated", subscriberId, {
				shipmentId: String(shipment.id),
				orderNumber: order.orderNumber,
				reason,
				audience: "shop",
			});
		}
	}
}

export function deferDeliveryNotification(
	req: PayloadRequest,
	work: () => Promise<void>,
	label: string,
): void {
	const run = async () => {
		try {
			await work();
		} catch (error) {
			req.payload.logger.error({ err: error }, `[delivery] ${label} failed`);
		}
	};
	if (!onCommit(commitContextOf(req), run)) void run();
}
