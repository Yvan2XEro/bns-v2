import type { Payload, TaskConfig } from "payload";
import { relationId } from "../lib/relationId";
import { notifyShipmentLate } from "../services/delivery/jobNotifications";
import { deferDeliveryNotification } from "../services/delivery/notifications";
import {
	isTerminalShipmentStatus,
	SHIPMENT_SERVICE_CONTEXT,
} from "../services/delivery/shipmentTransitions";
import {
	DAY_MS,
	forEachShipment,
	LIVE_SHIPMENT_STATUSES,
} from "./deliverySupport";

export async function flagLateShipments(
	payload: Payload,
	now: Date = new Date(),
): Promise<string[]> {
	const cutoff = new Date(now.getTime() - DAY_MS);
	return forEachShipment(
		payload,
		{
			and: [
				{ status: { in: LIVE_SHIPMENT_STATUSES } },
				{ promisedBy: { less_than_equal: cutoff.toISOString() } },
			],
		},
		"flagLateShipments",
		async (req, shipment) => {
			if (
				isTerminalShipmentStatus(shipment.status) ||
				!shipment.promisedBy ||
				Date.parse(shipment.promisedBy) > cutoff.getTime() ||
				shipment.flags?.includes("late")
			) {
				return null;
			}
			const updated = await req.payload.update({
				collection: "shipments",
				id: String(shipment.id),
				req,
				overrideAccess: true,
				context: SHIPMENT_SERVICE_CONTEXT,
				data: { flags: [...(shipment.flags ?? []), "late"] },
			});
			const orderId = relationId(updated.order);
			if (orderId) {
				const order = await req.payload.findByID({
					collection: "orders",
					id: orderId,
					depth: 0,
					overrideAccess: true,
					req,
				});
				deferDeliveryNotification(
					req,
					() => notifyShipmentLate(req.payload, order, updated),
					"late-shipment notification",
				);
			}
			return String(updated.id);
		},
	);
}

export const flagLateShipmentsTask: TaskConfig<{
	input: object;
	output: { flaggedCount: number };
}> = {
	slug: "flagLateShipments",
	retries: 1,
	inputSchema: [],
	handler: async ({ req }) => {
		const flagged = await flagLateShipments(req.payload);
		return { output: { flaggedCount: flagged.length } };
	},
};
