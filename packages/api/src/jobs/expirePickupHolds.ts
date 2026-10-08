import type { Payload, TaskConfig, Where } from "payload";
import { relationId } from "../lib/relationId";
import type { Shipment } from "../payload-types";
import {
	confirmReturned,
	finalizeFailure,
} from "../services/delivery/attempts";
import { notifyShipmentPickupReminder } from "../services/delivery/jobNotifications";
import { deferDeliveryNotification } from "../services/delivery/notifications";
import {
	applyShipmentTransition,
	SHIPMENT_SERVICE_CONTEXT,
} from "../services/delivery/shipmentTransitions";
import { DAY_MS, forEachShipment, metadataOf } from "./deliverySupport";

const REMINDER_LEAD_MS = 2 * DAY_MS;

function heldAtShop(shipment: Shipment): boolean {
	return (
		shipment.method === "pickup" &&
		shipment.status === "pending" &&
		Boolean(shipment.pickupDeadline)
	);
}

export async function expirePickupHolds(
	payload: Payload,
	now: Date = new Date(),
): Promise<{ reminded: string[]; expired: string[] }> {
	const nowMs = now.getTime();
	const base: Where[] = [
		{ method: { equals: "pickup" } },
		{ status: { equals: "pending" } },
	];

	const reminded = await forEachShipment(
		payload,
		{
			and: [
				...base,
				{ pickupDeadline: { greater_than: now.toISOString() } },
				{
					pickupDeadline: {
						less_than_equal: new Date(nowMs + REMINDER_LEAD_MS).toISOString(),
					},
				},
			],
		},
		"expirePickupHolds.remind",
		async (req, shipment) => {
			if (!heldAtShop(shipment)) return null;
			const deadline = Date.parse(String(shipment.pickupDeadline));
			const metadata = metadataOf(shipment);
			if (
				deadline <= nowMs ||
				deadline - nowMs > REMINDER_LEAD_MS ||
				metadata.pickupReminderAt
			) {
				return null;
			}
			const updated = await req.payload.update({
				collection: "shipments",
				id: String(shipment.id),
				req,
				overrideAccess: true,
				context: SHIPMENT_SERVICE_CONTEXT,
				data: {
					metadata: { ...metadata, pickupReminderAt: now.toISOString() },
				},
			});
			const orderId = relationId(updated.order);
			if (!orderId) return null;
			const order = await req.payload.findByID({
				collection: "orders",
				id: orderId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			deferDeliveryNotification(
				req,
				() => notifyShipmentPickupReminder(req.payload, order, updated),
				"pickup-reminder notification",
			);
			return String(updated.id);
		},
	);

	const expired = await forEachShipment(
		payload,
		{
			and: [
				...base,
				{ pickupDeadline: { less_than_equal: now.toISOString() } },
			],
		},
		"expirePickupHolds.expire",
		async (req, shipment) => {
			if (!heldAtShop(shipment)) return null;
			if (Date.parse(String(shipment.pickupDeadline)) > nowMs) return null;
			const { shipment: failed } = await applyShipmentTransition(
				req,
				shipment,
				"failed",
				{
					type: "shipment.failed_final",
					actorType: "system",
					visibility: "both",
					occurredAt: now.toISOString(),
					metadata: { reason: "not_collected" },
				},
			);
			const stamped = await req.payload.update({
				collection: "shipments",
				id: String(failed.id),
				req,
				overrideAccess: true,
				context: SHIPMENT_SERVICE_CONTEXT,
				data: { failedAt: now.toISOString() },
			});
			const finalized = await finalizeFailure(req, stamped, "not_collected");
			await confirmReturned(req, finalized, { type: "system" });
			return String(shipment.id);
		},
	);

	return { reminded, expired };
}

export const expirePickupHoldsTask: TaskConfig<{
	input: object;
	output: { remindedCount: number; expiredCount: number };
}> = {
	slug: "expirePickupHolds",
	retries: 1,
	inputSchema: [],
	handler: async ({ req }) => {
		const { reminded, expired } = await expirePickupHolds(req.payload);
		return {
			output: { remindedCount: reminded.length, expiredCount: expired.length },
		};
	},
};
