import { createHash, randomBytes } from "node:crypto";
import type { Payload, PayloadRequest } from "payload";
import type { Coordinates } from "../../lib/delivery/geo";
import {
	getDeliverySettings,
	riderLinksActive,
} from "../../lib/deliverySettings";
import { ERROR_CODES } from "../../lib/errors";
import {
	type CounterStore,
	getCounterStore,
	hitRateLimit,
} from "../../lib/rateLimit";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import type { Shipment } from "../../payload-types";
import { sendSms } from "../smsProvider";
import { type ReportAttemptInput, reportAttempt } from "./attempts";
import {
	type HandoverProofInput,
	handoverShipment,
	type ShipmentActor,
} from "./handover";
import { deferDeliveryNotification } from "./notifications";
import {
	appendShipmentEvent,
	applyShipmentTransition,
	SHIPMENT_SERVICE_CONTEXT,
} from "./shipmentTransitions";

const LINK_TTL_HOURS = 72;
const RATE_WINDOWS = {
	token: { name: "rider-link-token", limit: 30, windowSeconds: 3600 },
	ip: { name: "rider-link-ip", limit: 60, windowSeconds: 3600 },
} as const;

export interface RiderLinkView {
	shopName: string;
	shipmentNumber: string;
	origin: { landmark: string | null };
	destination: {
		recipientFirstName: string;
		phone: string | null;
		city: string;
		district: string | null;
		landmark: string | null;
		gps: { lat: number; lng: number } | null;
		mapsUrl: string | null;
	};
	expectedCod: number | null;
	items: Array<{ title: string; quantity: number }>;
	attempts: Array<{ number: number; reason: string; at: string }>;
	allowedActions: Array<"picked_up" | "attempt" | "handover" | "photo">;
}

function hash(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function isTerminal(status: Shipment["status"]): boolean {
	return ["delivered", "returned", "cancelled"].includes(status);
}

function publicWebUrl(): string {
	return (process.env.PUBLIC_WEB_URL ?? "https://buynsellem.com").replace(
		/\/$/,
		"",
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function coordinates(value: unknown): { lat: number; lng: number } | null {
	if (!isRecord(value)) return null;
	const lat = value.lat;
	const lng = value.lng;
	return typeof lat === "number" && typeof lng === "number"
		? { lat, lng }
		: null;
}

function riderActions(shipment: Shipment): RiderLinkView["allowedActions"] {
	if (shipment.status === "pending") return ["picked_up"];
	if (shipment.status === "picked_up") {
		return ["picked_up", "attempt", "handover", "photo"];
	}
	if (shipment.status === "in_transit") return ["attempt", "handover", "photo"];
	if (shipment.status === "failed" && !shipment.finalFailure?.at) {
		return ["picked_up"];
	}
	return [];
}

export async function riderLinkView(
	payload: Payload,
	shipment: Shipment,
): Promise<RiderLinkView> {
	const orderId = relationId(shipment.order);
	if (!orderId) throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	const [order, items] = await Promise.all([
		payload.findByID({
			collection: "orders",
			id: orderId,
			depth: 0,
			overrideAccess: true,
		}),
		payload.find({
			collection: "order-items",
			where: { order: { equals: orderId } },
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
		}),
	]);
	const shopId = relationId(shipment.storefrontShop);
	const shop = shopId
		? await payload
				.findByID({
					collection: "shops",
					id: shopId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null)
		: null;
	const origin = isRecord(shipment.origin) ? shipment.origin : {};
	const destination = isRecord(shipment.destination)
		? shipment.destination
		: {};
	const gps = coordinates(destination.gps) ?? coordinates(order.delivery.gps);
	const address = [
		stringValue(destination.landmark),
		stringValue(destination.district),
		stringValue(destination.city),
	]
		.filter((part): part is string => part !== null)
		.join(", ");
	const mapsUrl = gps
		? `https://www.google.com/maps/search/?api=1&query=${gps.lat},${gps.lng}`
		: address
			? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
			: null;
	return {
		shopName: typeof shop?.name === "string" ? shop.name : "",
		shipmentNumber: shipment.shipmentNumber,
		origin: { landmark: stringValue(origin.landmark) },
		destination: {
			recipientFirstName:
				stringValue(destination.recipientName)?.trim().split(/\s+/)[0] ??
				order.delivery.recipientName.trim().split(/\s+/)[0] ??
				"",
			phone: stringValue(destination.phone) ?? order.delivery.phone ?? null,
			city: stringValue(destination.city) ?? order.delivery.city ?? "",
			district:
				stringValue(destination.district) ?? order.delivery.district ?? null,
			landmark:
				stringValue(destination.landmark) ?? order.delivery.landmark ?? null,
			gps,
			mapsUrl,
		},
		expectedCod:
			order.paymentMethod === "cod" ? (order.amounts?.total ?? null) : null,
		items: items.docs.map((item) => ({
			title: item.snapshot?.title ?? "Article",
			quantity: item.quantity,
		})),
		attempts: (shipment.attempts ?? []).map((attempt) => ({
			number: attempt.number,
			reason: attempt.reason ?? "other",
			at: attempt.at,
		})),
		allowedActions: riderActions(shipment),
	};
}

export async function createRiderLink(
	req: PayloadRequest,
	shipment: Shipment,
	actorId?: string,
): Promise<{ url: string; shipment: Shipment }> {
	const settings = await getDeliverySettings(req.payload);
	if (
		!riderLinksActive(settings) ||
		shipment.carrier !== "self" ||
		isTerminal(shipment.status)
	) {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	const phone = shipment.rider?.phone;
	if (!phone) throw new ServiceError(ERROR_CODES.validation, 400);
	const shopId = relationId(shipment.storefrontShop);
	const shop = shopId
		? await req.payload
				.findByID({
					collection: "shops",
					id: shopId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null)
		: null;
	const rawToken = randomBytes(32).toString("base64url");
	const now = new Date();
	const createdAt = now.toISOString();
	const expiresAt = new Date(
		now.getTime() + LINK_TTL_HOURS * 60 * 60 * 1000,
	).toISOString();
	const updated = await req.payload.update({
		collection: "shipments",
		id: String(shipment.id),
		req,
		overrideAccess: true,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: {
			riderLink: {
				tokenHash: hash(rawToken),
				createdAt,
				expiresAt,
				revokedAt: null,
				lastUsedAt: null,
			},
		},
	});
	await appendShipmentEvent(req, updated, {
		type: "shipment.rider_link_created",
		actorType: "seller",
		actor: actorId ?? null,
		visibility: "shop",
		occurredAt: createdAt,
	});
	const url = `${publicWebUrl()}/r/${rawToken}`;
	const shopName =
		typeof shop?.name === "string" ? shop.name : "votre boutique";
	const destination = shipment.destination;
	const district =
		destination &&
		typeof destination === "object" &&
		"district" in destination &&
		typeof destination.district === "string"
			? destination.district
			: "";
	const message = `BuyNSellem: livraison ${shipment.shipmentNumber} pour ${shopName}, ${district}. Détails et code client: ${url}`;
	deferDeliveryNotification(
		req,
		async () => {
			try {
				await sendSms(req.payload, { to: phone, message });
			} catch (error) {
				req.payload.logger.error(
					{ err: error, shipmentId: String(shipment.id) },
					"[delivery] rider link SMS failed",
				);
			}
		},
		"rider link SMS",
	);
	return { url, shipment: updated };
}

export async function revokeRiderLink(
	req: PayloadRequest,
	shipment: Shipment,
	actorId?: string,
): Promise<Shipment> {
	if (!shipment.riderLink?.tokenHash || shipment.riderLink.revokedAt) {
		throw new ServiceError(ERROR_CODES.shipmentRiderLinkInvalid, 404);
	}
	const revokedAt = new Date().toISOString();
	const updated = await req.payload.update({
		collection: "shipments",
		id: String(shipment.id),
		req,
		overrideAccess: true,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: { riderLink: { ...shipment.riderLink, revokedAt } },
	});
	await appendShipmentEvent(req, updated, {
		type: "shipment.rider_link_revoked",
		actorType: "seller",
		actor: actorId ?? null,
		visibility: "shop",
		occurredAt: revokedAt,
	});
	return updated;
}

export async function resolveRiderLink(
	payload: Payload,
	token: string,
	req?: PayloadRequest,
): Promise<Shipment> {
	const settings = await getDeliverySettings(payload);
	if (!riderLinksActive(settings)) {
		throw new ServiceError(ERROR_CODES.shipmentRiderLinkInvalid, 404);
	}
	const result = await payload.find({
		collection: "shipments",
		where: { "riderLink.tokenHash": { equals: hash(token) } },
		depth: 0,
		limit: 1,
		pagination: false,
		overrideAccess: true,
		req,
	});
	const shipment = result.docs[0];
	if (
		!shipment ||
		!shipment.riderLink?.tokenHash ||
		shipment.carrier !== "self" ||
		shipment.riderLink.revokedAt ||
		!shipment.riderLink.expiresAt ||
		Date.parse(shipment.riderLink.expiresAt) <= Date.now() ||
		isTerminal(shipment.status)
	) {
		throw new ServiceError(ERROR_CODES.shipmentRiderLinkInvalid, 404);
	}
	return shipment;
}

export async function assertRiderLinkRateLimit(
	store: CounterStore,
	token: string,
	ip: string,
): Promise<void> {
	const [tokenLimited, ipLimited] = await Promise.all([
		hitRateLimit(store, hash(token), [RATE_WINDOWS.token]),
		hitRateLimit(store, hash(ip), [RATE_WINDOWS.ip]),
	]);
	if (tokenLimited || ipLimited) {
		throw new ServiceError(ERROR_CODES.rateLimited, 429);
	}
}

export async function publicRiderContext(request: Request, token: string) {
	const [{ default: config }, { getPayload }] = await Promise.all([
		import("@payload-config"),
		import("payload"),
	]);
	const payload = await getPayload({ config });
	const forwardedFor = request.headers.get("x-forwarded-for");
	const ip =
		request.headers.get("x-real-ip") ||
		forwardedFor?.split(",").at(-1)?.trim() ||
		"unknown";
	await assertRiderLinkRateLimit(getCounterStore(), token, ip);
	const shipment = await resolveRiderLink(payload, token);
	return { payload, shipment };
}

export async function riderLinkPickedUp(
	req: PayloadRequest,
	shipment: Shipment,
	gps?: Coordinates,
): Promise<Shipment> {
	const to =
		shipment.status === "pending"
			? "picked_up"
			: shipment.status === "picked_up" || shipment.status === "failed"
				? "in_transit"
				: null;
	if (!to) throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	const now = new Date().toISOString();
	const result = await applyShipmentTransition(req, shipment, to, {
		type: to === "picked_up" ? "shipment.picked_up" : "shipment.in_transit",
		actorType: "rider_link",
		actor: null,
		visibility: "both",
		occurredAt: now,
		...(gps ? { gps } : {}),
	});
	return req.payload.update({
		collection: "shipments",
		id: String(result.shipment.id),
		req,
		overrideAccess: true,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: to === "picked_up" ? { pickedUpAt: now } : { inTransitAt: now },
	});
}

export function riderLinkAttempt(
	req: PayloadRequest,
	shipment: Shipment,
	input: ReportAttemptInput,
): Promise<Shipment> {
	const actor: ShipmentActor = { type: "rider_link" };
	return reportAttempt(req, shipment, input, actor);
}

export function riderLinkHandover(
	req: PayloadRequest,
	shipment: Shipment,
	input: HandoverProofInput,
): Promise<Shipment> {
	const actor: ShipmentActor = { type: "rider_link" };
	return handoverShipment(req, shipment, input, actor);
}
