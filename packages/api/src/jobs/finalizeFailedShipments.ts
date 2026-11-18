import type { Payload, TaskConfig } from "payload";
import type { Shipment } from "../payload-types";
import { finalizeFailure } from "../services/delivery/attempts";
import { forEachShipment } from "./deliverySupport";

/** Failed, not yet final, past its reschedule window, with no redelivery still ahead. */
function dueForFinalFailure(shipment: Shipment, now: Date): boolean {
	if (shipment.status !== "failed" || shipment.finalFailure?.at) return false;
	const rescheduleBy = shipment.redelivery?.rescheduleBy;
	if (!rescheduleBy || Date.parse(rescheduleBy) > now.getTime()) return false;
	const scheduledFor = shipment.redelivery?.scheduledFor;
	return !scheduledFor || Date.parse(scheduledFor) <= now.getTime();
}

export async function finalizeFailedShipments(
	payload: Payload,
	now: Date = new Date(),
): Promise<string[]> {
	return forEachShipment(
		payload,
		{
			and: [
				{ status: { equals: "failed" } },
				{ "finalFailure.at": { exists: false } },
				{ "redelivery.rescheduleBy": { less_than_equal: now.toISOString() } },
			],
		},
		"finalizeFailedShipments",
		async (req, shipment) => {
			if (!dueForFinalFailure(shipment, now)) return null;
			const reason = shipment.attempts?.at(-1)?.reason ?? "other";
			await finalizeFailure(req, shipment, reason);
			return String(shipment.id);
		},
	);
}

export const finalizeFailedShipmentsTask: TaskConfig<{
	input: object;
	output: { finalizedCount: number };
}> = {
	slug: "finalizeFailedShipments",
	retries: 1,
	inputSchema: [],
	handler: async ({ req }) => {
		const finalized = await finalizeFailedShipments(req.payload);
		return { output: { finalizedCount: finalized.length } };
	},
};
