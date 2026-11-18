import type { Payload } from "payload";
import { triggerNotificationEvent } from "../../hooks/notificationEvents";
import { relationId } from "../../lib/relationId";
import type { Order, Shipment } from "../../payload-types";
import { recipientsForShop } from "../orders/notifications";
import { sendSms } from "../smsProvider";

export async function notifyShipmentPickupReminder(
	payload: Payload,
	order: Order,
	shipment: Shipment,
): Promise<void> {
	const orderId = String(order.id);
	const pickupDeadline = shipment.pickupDeadline ?? "";
	const buyerId = relationId(order.buyer);
	if (buyerId) {
		await triggerNotificationEvent({
			event: "shipment-pickup-reminder",
			subscriberId: buyerId,
			payload: { orderId, pickupDeadline },
		});
	}
	const phone = order.delivery.phone;
	if (!phone) return;
	try {
		await sendSms(payload, {
			to: phone,
			message: `BuyNSellem: retirez votre commande ${order.orderNumber} avant le ${pickupDeadline}.`,
		});
	} catch (error) {
		payload.logger.error(
			{ err: error, orderId },
			"[delivery] pickup reminder SMS failed",
		);
	}
}

export async function notifyShipmentLate(
	payload: Payload,
	order: Order,
	shipment: Shipment,
): Promise<void> {
	const shopId = relationId(shipment.fulfillingShop);
	if (!shopId) return;
	for (const subscriberId of await recipientsForShop(
		payload,
		shopId,
		"orders.view",
	)) {
		await triggerNotificationEvent({
			event: "shipment-late",
			subscriberId,
			payload: {
				shipmentId: String(shipment.id),
				orderNumber: order.orderNumber,
			},
		});
	}
}
