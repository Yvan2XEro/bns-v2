import type { Payload, PayloadRequest } from "payload";
import { ORDER_SERVICE_CONTEXT } from "../../collections/Orders";
import { ERROR_CODES } from "../../lib/errors";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import { RetryTransaction, withTransaction } from "../../lib/transactions";
import type { Order, Shipment, ShopLocation } from "../../payload-types";
import { registerOrderEventHandler } from "../orders/events";
import { nextNumber } from "../sequences";
import { defaultOrigin } from "./locations";
import {
	appendShipmentEvent,
	SHIPMENT_SERVICE_CONTEXT,
} from "./shipmentTransitions";

function isDuplicateKey(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === 11000
	);
}

function locationSnapshot(location: ShopLocation) {
	return {
		name: location.name,
		city: location.city,
		district: location.district,
		address: location.address ?? null,
		landmark: location.landmark,
		gps: location.gps,
	};
}

function destinationSnapshot(order: Order) {
	const { delivery } = order;
	return {
		recipientName: delivery.recipientName,
		phone: delivery.phone,
		city: delivery.city ?? null,
		district: delivery.district ?? delivery.districtOther ?? null,
		address: null,
		landmark: delivery.landmark ?? null,
		gps:
			typeof delivery.gps?.lat === "number" &&
			typeof delivery.gps.lng === "number"
				? { lat: delivery.gps.lat, lng: delivery.gps.lng }
				: null,
		instructions: delivery.instructions ?? null,
	};
}

export async function findLiveShipmentForOrder(
	req: PayloadRequest,
	orderId: string,
): Promise<Shipment | null> {
	const result = await req.payload.find({
		collection: "shipments",
		where: {
			and: [
				{ order: { equals: orderId } },
				{ status: { not_equals: "cancelled" } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return result.docs[0] ?? null;
}

export async function createShipmentForOrder(
	payload: Payload,
	order: Order,
): Promise<Shipment> {
	if (order.status !== "accepted") {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	const existing = await payload.find({
		collection: "shipments",
		where: {
			and: [
				{ order: { equals: String(order.id) } },
				{ status: { not_equals: "cancelled" } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	if (existing.docs[0]) return existing.docs[0];
	const now = new Date();
	const shipmentNumber = await nextNumber(payload, "SHP", now);

	return withTransaction(payload, async (req) => {
		const live = await findLiveShipmentForOrder(req, String(order.id));
		if (live) return live;
		const currentOrder = await req.payload.findByID({
			collection: "orders",
			id: String(order.id),
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (currentOrder.status !== "accepted") {
			throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
		}
		const items = await req.payload.find({
			collection: "order-items",
			where: { order: { equals: String(currentOrder.id) } },
			limit: 100,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const fulfillingShopId = relationId(items.docs[0]?.fulfillingShop);
		if (
			items.docs.length === 0 ||
			!fulfillingShopId ||
			items.docs.some(
				(item) => relationId(item.fulfillingShop) !== fulfillingShopId,
			)
		) {
			throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
		}
		const origin = await defaultOrigin(req.payload, fulfillingShopId, req);
		if (!origin) {
			throw new ServiceError(ERROR_CODES.deliveryNoActiveOption, 409);
		}
		const method = currentOrder.delivery.method;
		const storefrontShopId = relationId(currentOrder.shop);
		if (!method || !storefrontShopId) {
			throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
		}
		let shipment: Shipment;
		try {
			shipment = await req.payload.create({
				collection: "shipments",
				req,
				overrideAccess: true,
				context: SHIPMENT_SERVICE_CONTEXT,
				depth: 0,
				data: {
					shipmentNumber,
					order: String(currentOrder.id),
					storefrontShop: storefrontShopId,
					fulfillingShop: fulfillingShopId,
					items: items.docs.map((item) => ({
						orderItem: String(item.id),
						quantity: item.quantity,
					})),
					method,
					carrier: method === "courier" ? "courier" : "self",
					...(currentOrder.delivery.zone
						? { zone: relationId(currentOrder.delivery.zone) ?? undefined }
						: {}),
					...(currentOrder.delivery.pickupLocation
						? {
								pickupLocation:
									relationId(currentOrder.delivery.pickupLocation) ?? undefined,
							}
						: {}),
					origin: locationSnapshot(origin),
					destination: destinationSnapshot(currentOrder),
					fee: currentOrder.delivery.fee ?? 0,
					...(currentOrder.delivery.promisedBy
						? { promisedBy: currentOrder.delivery.promisedBy }
						: {}),
					status: "pending",
				},
			});
		} catch (error) {
			if (isDuplicateKey(error)) {
				throw new RetryTransaction("concurrent order shipment creation");
			}
			throw error;
		}
		await appendShipmentEvent(req, shipment, {
			type: "shipment.created",
			actorType: "system",
			visibility: "both",
			occurredAt: now.toISOString(),
		});
		const orderShipments = (currentOrder.shipments ?? [])
			.map((entry) => relationId(entry))
			.filter((id): id is string => id !== null);
		await req.payload.update({
			collection: "orders",
			id: String(currentOrder.id),
			req,
			overrideAccess: true,
			context: ORDER_SERVICE_CONTEXT,
			data: {
				shipments: [...new Set([...orderShipments, String(shipment.id)])],
			},
		});
		return shipment;
	});
}

export function registerShipmentOrderEvents(): () => void {
	return registerOrderEventHandler("order.accepted", async (payload, order) => {
		const items = await payload.find({
			collection: "order-items",
			where: { order: { equals: String(order.id) } },
			limit: 100,
			depth: 0,
			overrideAccess: true,
		});
		if (items.docs.some((item) => item.sourcing === "resale")) return;
		await createShipmentForOrder(payload, order);
	});
}
