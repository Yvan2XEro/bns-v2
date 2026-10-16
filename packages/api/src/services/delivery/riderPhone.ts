import type { Payload } from "payload";
import {
	isOutForDelivery,
	RIDER_PHONE_LIMITS,
} from "../../contracts/shipments";
import { ERROR_CODES } from "../../lib/errors";
import {
	type CounterStore,
	getCounterStore,
	hitRateLimit,
} from "../../lib/rateLimit";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import { SHIPMENT_SERVICE_CONTEXT } from "./shipmentTransitions";

/**
 * The rider's phone for the order's buyer, only while the parcel is out for
 * delivery. Every reveal is rate-limited and logged as a staff-only shipment
 * event; anyone else gets the same 404 as a missing shipment.
 */
export async function revealRiderPhone(
	payload: Payload,
	input: { shipmentId: string; viewerId: string; now?: Date },
	deps: { store?: CounterStore } = {},
): Promise<{ phone: string }> {
	const now = input.now ?? new Date();
	if (
		await hitRateLimit(
			deps.store ?? getCounterStore(),
			input.viewerId,
			RIDER_PHONE_LIMITS,
			now.getTime(),
		)
	) {
		throw new ServiceError(ERROR_CODES.rateLimited, 429);
	}

	const shipment = await payload
		.findByID({
			collection: "shipments",
			id: input.shipmentId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const orderId = shipment ? relationId(shipment.order) : null;
	const order = orderId
		? await payload
				.findByID({
					collection: "orders",
					id: orderId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null)
		: null;
	if (!shipment || !order || relationId(order.buyer) !== input.viewerId) {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
	const phone = shipment.rider?.phone?.trim() ?? "";
	if (!isOutForDelivery(shipment.status) || !phone) {
		throw new ServiceError(ERROR_CODES.contactPhoneUnavailable, 404);
	}

	await payload.create({
		collection: "shipment-events",
		overrideAccess: true,
		depth: 0,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: {
			shipment: String(shipment.id),
			order: orderId ?? undefined,
			type: "shipment.rider_phone_revealed",
			actorType: "buyer",
			actor: input.viewerId,
			visibility: "staff",
			statusTo: shipment.status,
			occurredAt: now.toISOString(),
		},
	});
	return { phone };
}
