import type { PayloadRequest, Where } from "payload";
import {
	SHIPMENT_STATUSES,
	type ShipmentStatus,
} from "../../lib/delivery/types";
import { getDeliverySettings } from "../../lib/deliverySettings";
import { ERROR_CODES } from "../../lib/errors";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import { commitContextOf, onCommit } from "../../lib/transactions";
import type { Shipment, ShipmentEvent } from "../../payload-types";
import { shipAcceptedOrderInTransaction } from "../orders/shipping";

export const SHIPMENT_SERVICE_CONTEXT = { shipmentService: true } as const;

export const SHIPMENT_TRANSITIONS: Record<
	ShipmentStatus,
	readonly ShipmentStatus[]
> = {
	pending: ["picked_up", "in_transit", "delivered", "failed", "cancelled"],
	picked_up: ["in_transit", "delivered", "failed", "cancelled"],
	in_transit: ["delivered", "failed", "cancelled"],
	delivered: [],
	failed: ["in_transit", "returned"],
	returned: [],
	cancelled: [],
};

export function assertShipmentTransition(
	from: ShipmentStatus,
	to: ShipmentStatus,
): void {
	if (!SHIPMENT_TRANSITIONS[from].includes(to)) {
		throw new ServiceError(
			ERROR_CODES.shipmentInvalidTransition,
			409,
			`cannot move shipment from "${from}" to "${to}"`,
		);
	}
}

export type ShipmentEventInput = Omit<
	ShipmentEvent,
	| "id"
	| "shipment"
	| "order"
	| "statusFrom"
	| "statusTo"
	| "createdAt"
	| "updatedAt"
>;

export async function appendShipmentEvent(
	req: PayloadRequest,
	shipment: Shipment,
	event: ShipmentEventInput,
	statusFrom?: ShipmentStatus,
): Promise<ShipmentEvent> {
	assertNoSecretMetadata(event.metadata);
	return req.payload.create({
		collection: "shipment-events",
		req,
		overrideAccess: true,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: {
			...event,
			shipment: String(shipment.id),
			order: relationId(shipment.order) ?? undefined,
			...(statusFrom ? { statusFrom } : {}),
			statusTo: shipment.status,
		},
	});
}

const STATUS_EVENT_TYPES: Partial<
	Record<ShipmentStatus, readonly ShipmentEvent["type"][]>
> = {
	picked_up: ["shipment.picked_up"],
	in_transit: ["shipment.in_transit", "shipment.redelivery_started"],
	delivered: ["shipment.delivered"],
	failed: ["shipment.attempt_failed", "shipment.failed_final"],
	returned: ["shipment.returned"],
	cancelled: ["shipment.cancelled"],
};

type ShipmentEventHandler = (
	req: PayloadRequest,
	shipment: Shipment,
	event: ShipmentEvent,
) => Promise<void> | void;

const handlers = new Map<string, ShipmentEventHandler[]>();
const SECRET_METADATA_KEY = /(?:code|token|secret|otp|hash)/i;

export function registerShipmentEventHandler(
	type: ShipmentEvent["type"],
	handler: ShipmentEventHandler,
): () => void {
	const registered = handlers.get(type) ?? [];
	registered.push(handler);
	handlers.set(type, registered);
	return () => {
		const current = handlers.get(type);
		if (!current) return;
		const index = current.indexOf(handler);
		if (index >= 0) current.splice(index, 1);
	};
}

function assertNoSecretMetadata(metadata: unknown): void {
	if (
		typeof metadata !== "object" ||
		metadata === null ||
		Array.isArray(metadata)
	)
		return;
	const leaked = Object.keys(metadata).filter((key) =>
		SECRET_METADATA_KEY.test(key),
	);
	if (leaked.length > 0) {
		throw new ServiceError(
			ERROR_CODES.badRequest,
			400,
			`shipment event metadata cannot contain secret fields: ${leaked.join(", ")}`,
		);
	}
}

function metadataReason(metadata: unknown): unknown {
	if (
		typeof metadata === "object" &&
		metadata !== null &&
		!Array.isArray(metadata) &&
		"reason" in metadata
	) {
		return metadata.reason;
	}
	return undefined;
}

function isShipment(value: unknown): value is Shipment {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		"status" in value
	);
}

function orderActorType(
	actorType: ShipmentEvent["actorType"],
): "buyer" | "seller" | "staff" | "system" | "courier" {
	if (
		actorType === "buyer" ||
		actorType === "seller" ||
		actorType === "staff" ||
		actorType === "system"
	) {
		return actorType;
	}
	return "courier";
}

async function applyInitialOrderShipmentEffect(
	req: PayloadRequest,
	shipment: Shipment,
	from: ShipmentStatus,
	to: ShipmentStatus,
	event: ShipmentEventInput,
): Promise<void> {
	if (
		from !== "pending" ||
		(to !== "picked_up" && to !== "in_transit" && to !== "delivered")
	) {
		return;
	}
	const orderId = relationId(shipment.order);
	if (!orderId) {
		throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	}
	const order = await req.payload.findByID({
		collection: "orders",
		id: orderId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (order.status === "shipped") return;
	if (order.status !== "accepted") {
		throw new ServiceError(ERROR_CODES.orderInvalidTransition, 409);
	}
	await shipAcceptedOrderInTransaction(req, order, {
		actorType: orderActorType(event.actorType),
		...(typeof event.actor === "string" ? { actor: event.actor } : {}),
	});
}

export async function applyShipmentTransition(
	req: PayloadRequest,
	shipment: Shipment,
	to: ShipmentStatus,
	event: ShipmentEventInput,
): Promise<{ shipment: Shipment; event: ShipmentEvent }> {
	const from = shipment.status;
	assertShipmentTransition(from, to);
	if (!STATUS_EVENT_TYPES[to]?.includes(event.type)) {
		throw invalidShipmentTransition(from, to);
	}
	const now = new Date();
	if (
		from === "pending" &&
		to === "picked_up" &&
		shipment.carrier !== "courier" &&
		!shipment.rider?.user &&
		!shipment.riderLink?.tokenHash
	) {
		throw invalidShipmentTransition(from, to);
	}
	if (
		from === "pending" &&
		to === "in_transit" &&
		shipment.carrier !== "self"
	) {
		throw invalidShipmentTransition(from, to);
	}
	if (
		from === "pending" &&
		to === "delivered" &&
		(shipment.method !== "pickup" || !shipment.readyForPickupAt)
	) {
		throw invalidShipmentTransition(from, to);
	}
	if (
		from === "pending" &&
		to === "failed" &&
		(shipment.method !== "pickup" ||
			metadataReason(event.metadata) !== "not_collected")
	) {
		throw invalidShipmentTransition(from, to);
	}
	if (from === "failed" && to === "in_transit") {
		const settings = await getDeliverySettings(req.payload);
		if (
			!shipment.redelivery?.rescheduleBy ||
			Date.parse(shipment.redelivery.rescheduleBy) <= now.getTime() ||
			isFinalShipmentFailure(shipment, settings.maxAttempts, now)
		) {
			throw invalidShipmentTransition(from, to);
		}
	}
	assertNoSecretMetadata(event.metadata);
	const where: Where = {
		and: [
			{ id: { equals: String(shipment.id) } },
			{ status: { equals: from } },
		],
	};
	const updated: unknown = await req.payload.db.updateOne({
		collection: "shipments",
		where,
		data: { status: to },
		req,
		returning: true,
	});
	if (!isShipment(updated)) {
		const fresh = await req.payload.findByID({
			collection: "shipments",
			id: String(shipment.id),
			depth: 0,
			overrideAccess: true,
			req,
		});
		throw new ServiceError(
			ERROR_CODES.shipmentInvalidTransition,
			409,
			`shipment ${shipment.shipmentNumber} is now ${fresh.status}, not ${from}`,
			{ status: fresh.status },
		);
	}
	const written = await appendShipmentEvent(req, updated, event, from);
	await applyInitialOrderShipmentEffect(req, updated, from, to, event);
	for (const handler of handlers.get(written.type) ?? []) {
		if (!onCommit(commitContextOf(req), () => handler(req, updated, written))) {
			await handler(req, updated, written);
		}
	}
	return { shipment: updated, event: written };
}

function invalidShipmentTransition(
	from: ShipmentStatus,
	to: ShipmentStatus,
): ServiceError {
	return new ServiceError(
		ERROR_CODES.shipmentInvalidTransition,
		409,
		`shipment cannot move from "${from}" to "${to}" for its current delivery state`,
	);
}

export function isTerminalShipmentStatus(status: ShipmentStatus): boolean {
	return (
		status === "delivered" || status === "returned" || status === "cancelled"
	);
}

export function isFinalShipmentFailure(
	shipment: Pick<Shipment, "attempts" | "redelivery">,
	maxAttempts: number,
	now: Date,
): boolean {
	const attempts = shipment.attempts ?? [];
	const last = attempts.at(-1);
	if (!last) return false;
	if (
		last.reason === "refused" ||
		last.reason === "damaged" ||
		last.reason === "not_collected" ||
		attempts.length >= maxAttempts
	) {
		return true;
	}
	const rescheduleBy = shipment.redelivery?.rescheduleBy;
	return (
		rescheduleBy !== null &&
		rescheduleBy !== undefined &&
		Date.parse(rescheduleBy) <= now.getTime()
	);
}

export const ALL_SHIPMENT_STATUSES = SHIPMENT_STATUSES;
