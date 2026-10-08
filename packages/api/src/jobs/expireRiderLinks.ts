import type { Payload, TaskConfig } from "payload";
import {
	appendShipmentEvent,
	isTerminalShipmentStatus,
	SHIPMENT_SERVICE_CONTEXT,
} from "../services/delivery/shipmentTransitions";
import { forEachShipment } from "./deliverySupport";

export async function expireRiderLinks(
	payload: Payload,
	now: Date = new Date(),
): Promise<string[]> {
	return forEachShipment(
		payload,
		{
			and: [
				{ "riderLink.tokenHash": { exists: true } },
				{ "riderLink.revokedAt": { exists: false } },
			],
		},
		"expireRiderLinks",
		async (req, shipment) => {
			const link = shipment.riderLink;
			if (!link?.tokenHash || link.revokedAt) return null;
			const lapsed =
				Boolean(link.expiresAt) &&
				Date.parse(link.expiresAt ?? "") <= now.getTime();
			if (!lapsed && !isTerminalShipmentStatus(shipment.status)) return null;
			const revokedAt = now.toISOString();
			const updated = await req.payload.update({
				collection: "shipments",
				id: String(shipment.id),
				req,
				overrideAccess: true,
				context: SHIPMENT_SERVICE_CONTEXT,
				data: { riderLink: { ...link, revokedAt } },
			});
			await appendShipmentEvent(req, updated, {
				type: "shipment.rider_link_revoked",
				actorType: "system",
				visibility: "shop",
				occurredAt: revokedAt,
			});
			return String(shipment.id);
		},
	);
}

export const expireRiderLinksTask: TaskConfig<{
	input: object;
	output: { revokedCount: number };
}> = {
	slug: "expireRiderLinks",
	retries: 1,
	inputSchema: [],
	handler: async ({ req }) => {
		const revoked = await expireRiderLinks(req.payload);
		return { output: { revokedCount: revoked.length } };
	},
};
