import type { Payload, PayloadRequest, Where } from "payload";
import type { ShipmentStatus } from "../lib/delivery/types";
import { withTransaction } from "../lib/transactions";
import type { Shipment } from "../payload-types";

export const LIVE_SHIPMENT_STATUSES: ShipmentStatus[] = [
	"pending",
	"picked_up",
	"in_transit",
	"failed",
];

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * Finds candidates with a cheap query, then re-reads each one inside its own
 * transaction before `work` decides: the query result may be stale by the time
 * the row is touched (a rescue, a redelivery), so the predicate is re-run on
 * fresh state. One failing shipment neither rolls back nor blocks the rest.
 */
export async function forEachShipment<T>(
	payload: Payload,
	where: Where,
	label: string,
	work: (req: PayloadRequest, shipment: Shipment) => Promise<T | null>,
): Promise<T[]> {
	const found = await payload.find({
		collection: "shipments",
		where,
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	const done: T[] = [];
	for (const candidate of found.docs) {
		try {
			const result = await withTransaction(payload, async (req) => {
				const fresh = await req.payload.findByID({
					collection: "shipments",
					id: String(candidate.id),
					depth: 0,
					overrideAccess: true,
					req,
				});
				return work(req, fresh);
			});
			if (result !== null) done.push(result);
		} catch (error) {
			payload.logger.error(
				{ err: error, shipmentId: String(candidate.id) },
				`[delivery] ${label} failed for one shipment; continuing`,
			);
		}
	}
	return done;
}

export function metadataOf(shipment: Shipment): Record<string, unknown> {
	const value = shipment.metadata;
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? { ...value }
		: {};
}
