import type { PayloadRequest } from "payload";
import type { DeliveryCalendar } from "../../lib/delivery/eta";
import { rescheduleDateAllowed } from "../../lib/delivery/eta";
import type { Coordinates } from "../../lib/delivery/geo";
import type { FailureReason } from "../../lib/delivery/types";
import { getDeliverySettings } from "../../lib/deliverySettings";
import { ERROR_CODES } from "../../lib/errors";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import type { Order, Shipment } from "../../payload-types";
import { markDeliveryFailed } from "../orders/delivery";
import { queueOrderEvent } from "../orders/events";
import { appendOrderEvent } from "../orders/transitions";
import type { ShipmentActor } from "./handover";
import {
	deferDeliveryNotification,
	notifyShipmentAttemptFailed,
	notifyShipmentRedeliveryScheduled,
	notifyShipmentReturnInitiated,
} from "./notifications";
import {
	appendShipmentEvent,
	applyShipmentTransition,
	SHIPMENT_SERVICE_CONTEXT,
	type ShipmentEventInput,
} from "./shipmentTransitions";

export interface ReportAttemptInput {
	reason: FailureReason;
	note?: string;
	gps?: Coordinates;
	photoId?: string;
}

export interface RescheduleShipmentInput {
	date: string;
	window: "morning" | "afternoon" | "evening";
	landmark?: string;
	gps?: Coordinates;
	note?: string;
}

function orderFailureReason(
	reason: FailureReason,
): NonNullable<NonNullable<Order["deliveryFailure"]>["reason"]> {
	switch (reason) {
		case "not_collected":
		case "absent":
			return "absent";
		case "refused":
			return "refused";
		case "unreachable":
			return "unreachable";
		case "address_not_found":
			return "address_not_found";
		default:
			return "other";
	}
}

function orderFailureReasonForShipment(shipment: Shipment): FailureReason {
	const buyerFaultReason = shipment.attempts?.find(
		(attempt) =>
			attempt.reason === "refused" ||
			attempt.reason === "absent" ||
			attempt.reason === "unreachable" ||
			attempt.reason === "not_collected",
	);
	return (
		buyerFaultReason?.reason ??
		shipment.finalFailure?.reason ??
		shipment.attempts?.at(-1)?.reason ??
		"other"
	);
}

function orderActorType(
	actor: ShipmentActor["type"],
): "seller" | "staff" | "courier" | "system" {
	if (actor === "seller" || actor === "staff" || actor === "system")
		return actor;
	return "courier";
}

async function orderForShipment(req: PayloadRequest, shipment: Shipment) {
	const orderId = relationId(shipment.order);
	if (!orderId) throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	return req.payload.findByID({
		collection: "orders",
		id: orderId,
		depth: 0,
		overrideAccess: true,
		req,
	});
}

export async function reportAttempt(
	req: PayloadRequest,
	shipment: Shipment,
	input: ReportAttemptInput,
	actor: ShipmentActor,
): Promise<Shipment> {
	if (shipment.status !== "in_transit" && shipment.status !== "picked_up") {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	const settings = await getDeliverySettings(req.payload);
	const attempts = shipment.attempts ?? [];
	if (attempts.length >= settings.maxAttempts) {
		throw new ServiceError(ERROR_CODES.shipmentMaxAttemptsReached, 409);
	}
	const now = new Date();
	const final =
		input.reason === "refused" ||
		input.reason === "damaged" ||
		input.reason === "not_collected" ||
		attempts.length + 1 >= settings.maxAttempts;
	const eventInput: ShipmentEventInput = {
		type: final ? "shipment.failed_final" : "shipment.attempt_failed",
		actorType: actor.type,
		actor: actor.id,
		visibility: "both",
		occurredAt: now.toISOString(),
		...(input.note ? { note: input.note } : {}),
		...(input.gps ? { gps: input.gps } : {}),
		metadata: { reason: input.reason },
	};
	const transition = await applyShipmentTransition(
		req,
		shipment,
		"failed",
		eventInput,
	);
	const updatedResult = await req.payload.update({
		collection: "shipments",
		where: {
			and: [
				{ id: { equals: String(transition.shipment.id) } },
				{ status: { equals: transition.shipment.status } },
			],
		},
		limit: 1,
		req,
		overrideAccess: true,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: {
			attempts: [
				...attempts,
				{
					number: attempts.length + 1,
					outcome: "failed",
					reason: input.reason,
					actorType: actor.type,
					actor: actor.id,
					at: now.toISOString(),
					...(input.note ? { note: input.note } : {}),
					...(input.gps ? { gps: input.gps } : {}),
					...(input.photoId ? { photo: input.photoId } : {}),
				},
			],
			failedAt: now.toISOString(),
			...(!final
				? {
						redelivery: {
							...shipment.redelivery,
							rescheduleBy: new Date(
								now.getTime() + settings.rescheduleHours * 3_600_000,
							).toISOString(),
						},
					}
				: {}),
		},
	});
	const updated = updatedResult.docs[0];
	if (!updated)
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	const order = await orderForShipment(req, updated);
	const priorAttempts = order.deliveryFailure?.attempts ?? 0;
	const orderUpdate = await req.payload.update({
		collection: "orders",
		id: String(order.id),
		req,
		overrideAccess: true,
		data: {
			deliveryFailure: {
				...order.deliveryFailure,
				attempts: Math.max(priorAttempts, attempts.length + 1),
				reason: orderFailureReason(input.reason),
				note: input.note ?? null,
			},
		},
	});
	const orderEvent = await appendOrderEvent(req, orderUpdate, {
		type: "order.delivery_attempt_failed",
		visibility: "both",
		actorType: orderActorType(actor.type),
		actor: actor.id ?? null,
		reason: orderFailureReason(input.reason),
		note: input.note ?? null,
	});
	queueOrderEvent(req, orderUpdate, orderEvent);
	if (!final && updated.redelivery?.rescheduleBy) {
		const rescheduleBy = updated.redelivery.rescheduleBy;
		deferDeliveryNotification(
			req,
			() =>
				notifyShipmentAttemptFailed(
					req.payload,
					orderUpdate,
					updated,
					input.reason,
					Math.max(0, settings.maxAttempts - attempts.length - 1),
					rescheduleBy,
				),
			"attempt-failed notification",
		);
	}
	return final ? finalizeFailure(req, updated, input.reason) : updated;
}

export async function rescheduleShipment(
	req: PayloadRequest,
	shipment: Shipment,
	input: RescheduleShipmentInput,
	requestedBy: "buyer" | "seller",
	actorId?: string,
): Promise<Shipment> {
	const now = new Date();
	if (
		shipment.status !== "failed" ||
		shipment.finalFailure?.at ||
		!shipment.redelivery?.rescheduleBy ||
		Date.parse(shipment.redelivery.rescheduleBy) <= now.getTime()
	) {
		throw new ServiceError(ERROR_CODES.shipmentRescheduleWindowClosed, 409);
	}
	const date = new Date(input.date);
	const zoneId = relationId(shipment.zone);
	if (!zoneId)
		throw new ServiceError(ERROR_CODES.shipmentRescheduleDateInvalid, 400);
	const zone = await req.payload.findByID({
		collection: "delivery-zones",
		id: zoneId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const calendar: DeliveryCalendar = {
		deliveryDays: zone.deliveryDays,
		...(zone.cutoffTime ? { cutoffTime: zone.cutoffTime } : {}),
	};
	if (!rescheduleDateAllowed(date, calendar, now)) {
		throw new ServiceError(ERROR_CODES.shipmentRescheduleDateInvalid, 400);
	}
	const order = await orderForShipment(req, shipment);
	const previousDestination =
		typeof shipment.destination === "object" &&
		shipment.destination !== null &&
		!Array.isArray(shipment.destination)
			? shipment.destination
			: {};
	const destination = {
		...previousDestination,
		...(input.landmark !== undefined ? { landmark: input.landmark } : {}),
		...(input.gps ? { gps: input.gps } : {}),
	};
	const updated = await req.payload.update({
		collection: "shipments",
		id: String(shipment.id),
		req,
		overrideAccess: true,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: {
			destination,
			redelivery: {
				...shipment.redelivery,
				scheduledFor: date.toISOString(),
				window: input.window,
				requestedBy,
				note: input.note ?? null,
			},
		},
	});
	if (input.landmark !== undefined || input.gps) {
		await req.payload.update({
			collection: "orders",
			id: String(order.id),
			req,
			overrideAccess: true,
			data: {
				delivery: {
					...order.delivery,
					...(input.landmark !== undefined ? { landmark: input.landmark } : {}),
					...(input.gps ? { gps: input.gps } : {}),
				},
			},
		});
		const event = await appendOrderEvent(req, order, {
			type: "order.address_updated",
			visibility: "shop",
			actorType: requestedBy,
			actor:
				actorId ?? (requestedBy === "buyer" ? relationId(order.buyer) : null),
			note: "Delivery landmark or GPS updated for redelivery.",
		});
		queueOrderEvent(req, order, event);
	}
	await appendShipmentEvent(req, updated, {
		type: "shipment.rescheduled",
		actorType: requestedBy,
		visibility: "both",
		occurredAt: now.toISOString(),
		...(input.note ? { note: input.note } : {}),
		metadata: { requestedBy, scheduledFor: date.toISOString() },
	});
	deferDeliveryNotification(
		req,
		() => notifyShipmentRedeliveryScheduled(req.payload, order, updated),
		"redelivery-scheduled notification",
	);
	return updated;
}

export async function finalizeFailure(
	req: PayloadRequest,
	shipment: Shipment,
	reason: FailureReason,
): Promise<Shipment> {
	if (shipment.status !== "failed") {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	if (shipment.finalFailure?.at) return shipment;
	const now = new Date().toISOString();
	const order = await orderForShipment(req, shipment);
	const resaleItems =
		reason === "refused" && order.paymentMethod === "cod"
			? await req.payload.find({
					collection: "order-items",
					where: {
						order: { equals: String(order.id) },
						sourcing: { equals: "resale" },
					},
					limit: 1,
					depth: 0,
					overrideAccess: true,
					req,
				})
			: null;
	const updated = await req.payload.update({
		collection: "shipments",
		id: String(shipment.id),
		req,
		overrideAccess: true,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: {
			finalFailure: { reason, at: now, returnInitiatedAt: now },
			failureCostBearer: resaleItems?.docs.length ? "reseller" : "shop",
		},
	});
	await appendShipmentEvent(req, updated, {
		type: "shipment.return_initiated",
		actorType: "system",
		visibility: "both",
		occurredAt: now,
		metadata: { reason },
	});
	deferDeliveryNotification(
		req,
		() => notifyShipmentReturnInitiated(req.payload, order, updated, reason),
		"return-initiated notification",
	);
	return updated;
}

export async function confirmReturned(
	req: PayloadRequest,
	shipment: Shipment,
	actor: ShipmentActor,
): Promise<Shipment> {
	if (shipment.status !== "failed" || !shipment.finalFailure?.at) {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	const reason = orderFailureReasonForShipment(shipment);
	const { shipment: returned } = await applyShipmentTransition(
		req,
		shipment,
		"returned",
		{
			type: "shipment.returned",
			actorType: actor.type,
			actor: actor.id,
			visibility: "both",
			occurredAt: new Date().toISOString(),
			metadata: { reason },
		},
	);
	const order = await orderForShipment(req, returned);
	if (order.status === "shipped") {
		await markDeliveryFailed(req, order, {
			reason: orderFailureReason(reason),
			actorType: orderActorType(actor.type),
			actor: actor.id,
			note: shipment.attempts?.at(-1)?.note ?? undefined,
		});
	} else if (order.status !== "delivery_failed") {
		throw new ServiceError(ERROR_CODES.orderInvalidTransition, 409);
	}
	const updated = await req.payload.update({
		collection: "shipments",
		id: String(returned.id),
		req,
		overrideAccess: true,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: { returnedAt: new Date().toISOString() },
	});
	return updated;
}
