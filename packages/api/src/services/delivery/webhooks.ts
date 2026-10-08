import type { PayloadRequest } from "payload";
import type {
	CourierProviderId,
	CourierWebhookEvent,
	ShipmentStatus,
} from "../../lib/delivery/types";
import { relationId } from "../../lib/relationId";
import type { Shipment } from "../../payload-types";
import { markDelivered } from "../orders/delivery";
import {
	appendShipmentEvent,
	applyShipmentTransition,
	SHIPMENT_TRANSITIONS,
} from "./shipmentTransitions";

type AppliedResult = {
	outcome:
		| "applied"
		| "duplicate"
		| "stored_without_transition"
		| "out_of_order"
		| "shipment_not_found";
};

const statusEvents: Partial<
	Record<
		ShipmentStatus,
		| "shipment.picked_up"
		| "shipment.in_transit"
		| "shipment.delivered"
		| "shipment.attempt_failed"
		| "shipment.returned"
		| "shipment.cancelled"
	>
> = {
	picked_up: "shipment.picked_up",
	in_transit: "shipment.in_transit",
	delivered: "shipment.delivered",
	failed: "shipment.attempt_failed",
	returned: "shipment.returned",
	cancelled: "shipment.cancelled",
};

export async function applyCourierEvent(
	req: PayloadRequest,
	provider: Exclude<CourierProviderId, "manual">,
	event: CourierWebhookEvent,
): Promise<AppliedResult> {
	const found = await req.payload.find({
		collection: "shipments",
		where: {
			and: [
				{ provider: { equals: provider } },
				{
					or: [
						{ shipmentNumber: { equals: event.reference } },
						{ providerShipmentId: { equals: event.providerShipmentId } },
					],
				},
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const shipment = found.docs[0] as Shipment | undefined;
	if (!shipment) return { outcome: "shipment_not_found" };

	const duplicate = await req.payload.find({
		collection: "shipment-events",
		where: {
			and: [
				{ shipment: { equals: String(shipment.id) } },
				{ providerEventId: { equals: event.providerEventId } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (duplicate.docs.length > 0) return { outcome: "duplicate" };

	const previous = await req.payload.find({
		collection: "shipment-events",
		where: {
			and: [
				{ shipment: { equals: String(shipment.id) } },
				{ providerEventId: { exists: true } },
				{ type: { not_equals: "shipment.provider_status" } },
			],
		},
		sort: "-occurredAt",
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const previousAt = previous.docs[0]?.occurredAt;
	if (previousAt && Date.parse(previousAt) >= event.occurredAt.getTime()) {
		await appendShipmentEvent(req, shipment, {
			type: "shipment.provider_status",
			actorType: "courier_webhook",
			providerEventId: event.providerEventId,
			visibility: "staff",
			occurredAt: event.occurredAt.toISOString(),
			metadata: { providerStatus: event.providerStatus, outOfOrder: true },
		});
		return { outcome: "out_of_order" };
	}

	const status = event.status;
	const eventType = status === null ? undefined : statusEvents[status];
	if (
		status === null ||
		!eventType ||
		!SHIPMENT_TRANSITIONS[shipment.status].includes(status) ||
		(shipment.status === "pending" &&
			(status === "delivered" || status === "failed"))
	) {
		await req.payload.update({
			collection: "shipments",
			id: String(shipment.id),
			depth: 0,
			overrideAccess: true,
			req,
			data: {
				providerStatus: {
					providerStatus: event.providerStatus,
					status: event.status,
					occurredAt: event.occurredAt.toISOString(),
					providerEventId: event.providerEventId,
				},
			},
		});
		await appendShipmentEvent(req, shipment, {
			type: "shipment.provider_status",
			actorType: "courier_webhook",
			providerEventId: event.providerEventId,
			visibility: "staff",
			occurredAt: event.occurredAt.toISOString(),
			metadata: { providerStatus: event.providerStatus },
		});
		return { outcome: "stored_without_transition" };
	}

	const transition = await applyShipmentTransition(req, shipment, status, {
		type: eventType,
		actorType: "courier_webhook",
		actor: null,
		providerEventId: event.providerEventId,
		visibility: "both",
		occurredAt: event.occurredAt.toISOString(),
		metadata: { providerStatus: event.providerStatus },
	});
	let orderTotal: number | undefined;
	if (status === "delivered") {
		const orderId = relationId(transition.shipment.order);
		if (!orderId) throw new Error("Courier shipment has no order relation");
		const order = await req.payload.findByID({
			collection: "orders",
			id: orderId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		orderTotal = order.amounts?.total ?? undefined;
		if (order.status === "shipped") {
			await markDelivered(req, order, {
				method: "carrier_pod",
				actorType: "courier",
				note: event.proof?.recipientName
					? `Carrier proof of delivery: ${event.proof.recipientName}`
					: "Carrier reported delivery without a verified handover code",
			});
		} else if (order.status !== "delivered") {
			throw new Error(`Courier-reported delivered order is ${order.status}`);
		}
	}
	const flags = new Set(transition.shipment.flags ?? []);
	if (status === "delivered") flags.add("delivered_without_code");
	const priorAttempts = transition.shipment.attempts ?? [];
	const expectedCodAmount =
		transition.shipment.codCollection?.expectedAmount ?? orderTotal;
	await req.payload.update({
		collection: "shipments",
		id: String(shipment.id),
		depth: 0,
		overrideAccess: true,
		req,
		data: {
			providerStatus: {
				providerStatus: event.providerStatus,
				status,
				occurredAt: event.occurredAt.toISOString(),
				providerEventId: event.providerEventId,
			},
			...(status === "delivered"
				? {
						deliveredAt: event.occurredAt.toISOString(),
						proof: {
							...transition.shipment.proof,
							handoverMethod: "carrier_pod",
							providerPodUrl: event.proof?.podUrl,
							recipientName: event.proof?.recipientName,
							gps: event.proof?.gps,
							capturedAt: event.occurredAt.toISOString(),
						},
						flags: [...flags],
					}
				: {}),
			...(event.attempt || status === "delivered" || status === "failed"
				? {
						attempts: [
							...priorAttempts,
							{
								number: priorAttempts.length + 1,
								outcome: status === "delivered" ? "delivered" : "failed",
								...(event.attempt?.reason
									? { reason: event.attempt.reason }
									: {}),
								...(event.attempt?.note ? { note: event.attempt.note } : {}),
								actorType: "courier_webhook",
								at: event.occurredAt.toISOString(),
							},
						],
					}
				: {}),
			...(event.rider
				? { rider: { ...transition.shipment.rider, ...event.rider } }
				: {}),
			...(event.codCollectedAmount !== undefined
				? {
						codCollection: {
							...transition.shipment.codCollection,
							...(expectedCodAmount !== undefined
								? { expectedAmount: expectedCodAmount }
								: {}),
							collectedAmount: event.codCollectedAmount,
							collectedBy: "courier",
							remittanceStatus: "pending",
						},
					}
				: {}),
		},
	});
	return { outcome: "applied" };
}
