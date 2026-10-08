import type { PayloadRequest } from "payload";
import type { ShopRole } from "../../access/shopRoles";
import { type Coordinates, haversineMeters } from "../../lib/delivery/geo";
import { getDeliverySettings } from "../../lib/deliverySettings";
import { ERROR_CODES } from "../../lib/errors";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import type { Order, Shipment } from "../../payload-types";
import { markDelivered } from "../orders/delivery";
import { verifyHandoverCode } from "../orders/handover";
import { shipAcceptedOrderInTransaction } from "../orders/shipping";
import {
	appendShipmentEvent,
	applyShipmentTransition,
	SHIPMENT_SERVICE_CONTEXT,
	type ShipmentEventInput,
} from "./shipmentTransitions";

export type ShipmentActorType = Extract<
	ShipmentEventInput["actorType"],
	"seller" | "rider" | "rider_link" | "dispatcher" | "staff" | "system"
>;

export interface HandoverProofInput {
	code: string;
	gps?: Coordinates & { accuracyMeters?: number };
	photoId?: string;
	recipientName?: string;
}

export interface SellerDeclarationInput {
	note?: string;
	gps?: Coordinates & { accuracyMeters?: number };
	photoId: string;
}

export interface ShipmentActor {
	type: ShipmentActorType;
	id?: string;
	shopRole?: ShopRole;
}

function coordinates(value: unknown): Coordinates | null {
	if (!value || typeof value !== "object") return null;
	const point = "gps" in value ? value.gps : value;
	if (!point || typeof point !== "object") return null;
	if (!("lat" in point) || !("lng" in point)) return null;
	const { lat, lng } = point;
	return typeof lat === "number" && typeof lng === "number"
		? { lat, lng }
		: null;
}

function orderActor(
	actor: ShipmentActor,
): "seller" | "staff" | "courier" | "system" {
	if (
		actor.type === "seller" ||
		actor.type === "staff" ||
		actor.type === "system"
	) {
		return actor.type;
	}
	return "courier";
}

function collectionActor(
	actor: ShipmentActor,
): NonNullable<NonNullable<Shipment["codCollection"]>["collectedBy"]> {
	if (actor.type === "seller") return "seller";
	if (actor.type === "rider" || actor.type === "rider_link") return "rider";
	return "courier";
}

function eventFor(
	type: ShipmentEventInput["type"],
	actor: ShipmentActor,
	input: { gps?: HandoverProofInput["gps"]; note?: string },
): ShipmentEventInput {
	return {
		type,
		actorType: actor.type,
		actor: actor.id,
		visibility: "both",
		occurredAt: new Date().toISOString(),
		...(input.note ? { note: input.note } : {}),
		...(input.gps ? { gps: input.gps } : {}),
	};
}

async function orderForShipment(
	req: PayloadRequest,
	shipment: Shipment,
): Promise<Order> {
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

async function writeDeliveryProof(
	req: PayloadRequest,
	shipment: Shipment,
	actor: ShipmentActor,
	method: NonNullable<NonNullable<Shipment["proof"]>["handoverMethod"]>,
	input: HandoverProofInput | SellerDeclarationInput,
	expectedAmount: number,
): Promise<Shipment> {
	const now = new Date().toISOString();
	const destination = coordinates(shipment.destination);
	const distance =
		destination && input.gps ? haversineMeters(destination, input.gps) : null;
	const settings = await getDeliverySettings(req.payload);
	const flags = new Set(shipment.flags ?? []);
	if (distance !== null && distance > settings.gpsFarThresholdMeters) {
		flags.add("gps_far");
	}
	const photoId = input.photoId;
	const updatedResult = await req.payload.update({
		collection: "shipments",
		where: {
			and: [
				{ id: { equals: String(shipment.id) } },
				{ status: { equals: "delivered" } },
			],
		},
		limit: 1,
		req,
		overrideAccess: true,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: {
			proof: {
				...shipment.proof,
				handoverMethod: method,
				...(method === "otp" ? { otpVerifiedAt: now } : {}),
				...(photoId ? { photo: photoId } : {}),
				...(input.gps ? { gps: input.gps } : {}),
				...(distance !== null
					? { distanceFromDestinationMeters: distance }
					: {}),
				...("recipientName" in input && input.recipientName
					? { recipientName: input.recipientName }
					: {}),
				capturedBy: actor.id ?? null,
				capturedAt: now,
			},
			codCollection: {
				expectedAmount,
				collectedBy: collectionActor(actor),
				collectedAmount: expectedAmount,
				remittanceStatus:
					actor.type === "seller" ? "not_applicable" : "pending",
			},
			deliveredAt: now,
			flags: [...flags],
		},
	});
	const updated = updatedResult.docs[0];
	if (!updated) {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	return updated;
}

/** Caller must pass a request participating in the route's transaction. */
export async function startShipment(
	req: PayloadRequest,
	shipment: Shipment,
	actor: ShipmentActor,
): Promise<Shipment> {
	if (shipment.carrier !== "self" || shipment.method === "pickup") {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	const now = new Date().toISOString();
	const result = await applyShipmentTransition(
		req,
		shipment,
		"in_transit",
		eventFor("shipment.in_transit", actor, {}),
	);
	return req.payload.update({
		collection: "shipments",
		id: String(result.shipment.id),
		req,
		overrideAccess: true,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: { inTransitAt: now },
	});
}

/** Records a pickup parcel's ready time and deadline without inventing a status. */
export async function readyForPickup(
	req: PayloadRequest,
	shipment: Shipment,
	actor: ShipmentActor,
): Promise<Shipment> {
	if (shipment.method !== "pickup" || shipment.status !== "pending") {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	if (shipment.readyForPickupAt) {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	const settings = await getDeliverySettings(req.payload);
	const locationId = relationId(shipment.pickupLocation);
	const location = locationId
		? await req.payload.findByID({
				collection: "shop-locations",
				id: locationId,
				depth: 0,
				overrideAccess: true,
				req,
			})
		: null;
	const now = new Date();
	const readyForPickupAt = now.toISOString();
	const pickupDeadline = new Date(
		now.getTime() +
			(location?.holdDays ?? settings.pickupHoldDaysDefault) *
				24 *
				60 *
				60 *
				1000,
	).toISOString();
	const updatedResult = await req.payload.update({
		collection: "shipments",
		where: {
			and: [
				{ id: { equals: String(shipment.id) } },
				{ status: { equals: "pending" } },
				{ method: { equals: "pickup" } },
			],
		},
		limit: 1,
		req,
		overrideAccess: true,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: { readyForPickupAt, pickupDeadline },
	});
	const updated = updatedResult.docs[0];
	if (!updated) {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	const order = await orderForShipment(req, updated);
	if (order.status === "accepted") {
		await shipAcceptedOrderInTransaction(req, order, {
			actorType: orderActor(actor),
			...(actor.id ? { actor: actor.id } : {}),
			...(actor.shopRole ? { actorShopRole: actor.shopRole } : {}),
		});
	} else if (order.status !== "shipped") {
		throw new ServiceError(ERROR_CODES.orderInvalidTransition, 409);
	}
	await appendShipmentEvent(
		req,
		updated,
		eventFor("shipment.ready_for_pickup", actor, {}),
	);
	return updated;
}

export async function handoverShipment(
	req: PayloadRequest,
	shipment: Shipment,
	input: HandoverProofInput,
	actor: ShipmentActor,
): Promise<Shipment> {
	const order = await orderForShipment(req, shipment);
	if (order.status !== "shipped" && order.status !== "accepted") {
		throw new ServiceError(ERROR_CODES.orderInvalidTransition, 409);
	}
	await verifyHandoverCode(req, order, input.code, {
		actor: { type: orderActor(actor), id: actor.id },
		shipmentId: String(shipment.id),
	});
	const result = await applyShipmentTransition(
		req,
		shipment,
		"delivered",
		eventFor("shipment.delivered", actor, { gps: input.gps }),
	);
	const freshOrder = await orderForShipment(req, result.shipment);
	await markDelivered(req, freshOrder, {
		method: "otp",
		actorType: orderActor(actor),
		...(actor.id ? { actor: actor.id } : {}),
		...(actor.shopRole ? { actorShopRole: actor.shopRole } : {}),
	});
	const expectedAmount = order.amounts?.total ?? 0;
	return writeDeliveryProof(
		req,
		result.shipment,
		actor,
		"otp",
		input,
		expectedAmount,
	);
}

export async function declareDelivered(
	req: PayloadRequest,
	shipment: Shipment,
	input: SellerDeclarationInput,
	actor: ShipmentActor,
): Promise<Shipment> {
	if (shipment.carrier !== "self" || actor.type !== "seller") {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	if (!input.photoId) {
		throw new ServiceError(ERROR_CODES.shipmentPhotoRequired, 400);
	}
	const order = await orderForShipment(req, shipment);
	if (order.status !== "shipped") {
		throw new ServiceError(ERROR_CODES.orderInvalidTransition, 409);
	}
	const result = await applyShipmentTransition(
		req,
		shipment,
		"delivered",
		eventFor("shipment.delivered", actor, {
			gps: input.gps,
			note: input.note,
		}),
	);
	const freshOrder = await orderForShipment(req, result.shipment);
	await markDelivered(req, freshOrder, {
		method: "seller_declaration",
		actorType: "seller",
		actor: actor.id,
		...(actor.shopRole ? { actorShopRole: actor.shopRole } : {}),
	});
	return writeDeliveryProof(
		req,
		result.shipment,
		actor,
		"seller_declaration",
		input,
		order.amounts?.total ?? 0,
	);
}
