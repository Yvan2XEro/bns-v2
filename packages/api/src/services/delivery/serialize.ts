import type { Payload } from "payload";
import { resolveCourierRole } from "../../access/courierRoles";
import {
	type OrderViewer,
	requireOrderAudience,
} from "../../access/orderAccess";
import { isModerator } from "../../access/roles";
import { can, resolveShopRole } from "../../access/shopRoles";
import type {
	BuyerShipmentView,
	CourierShipmentView,
	ShipmentProofView,
	ShipmentView,
	ShopShipmentView,
} from "../../contracts/shipments";
import { ERROR_CODES } from "../../lib/errors";
import { createSignedDocumentUrl } from "../../lib/privateFiles";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import type { Order, Shipment } from "../../payload-types";

function timestamp(value: string | null | undefined): string | null {
	return value ?? null;
}

function activeRider(shipment: Shipment): BuyerShipmentView["rider"] {
	const scheduledRetry = Boolean(
		shipment.status === "failed" &&
			shipment.redelivery?.scheduledFor &&
			shipment.redelivery.rescheduleBy &&
			Date.parse(shipment.redelivery.rescheduleBy) > Date.now(),
	);
	if (
		shipment.status !== "picked_up" &&
		shipment.status !== "in_transit" &&
		!scheduledRetry
	) {
		return null;
	}
	const name = shipment.rider?.name?.trim();
	const phone = shipment.rider?.phone;
	if (!name || !phone) return null;
	return { firstName: name.split(/\s+/)[0] ?? name, phone };
}

function rescheduleView(shipment: Shipment): BuyerShipmentView["redelivery"] {
	const redelivery = shipment.redelivery;
	if (
		!redelivery?.scheduledFor ||
		!redelivery.window ||
		!redelivery.rescheduleBy
	) {
		return null;
	}
	return {
		scheduledFor: redelivery.scheduledFor,
		window: redelivery.window,
		rescheduleBy: redelivery.rescheduleBy,
	};
}

export async function shipmentViewFor(
	payload: Payload,
	shipment: Shipment,
	caller: OrderViewer,
): Promise<ShipmentView> {
	const orderId = relationId(shipment.order);
	if (!orderId) throw new ServiceError(ERROR_CODES.notFound, 404);
	const order = await payload
		.findByID({
			collection: "orders",
			id: orderId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => {
			throw new ServiceError(ERROR_CODES.notFound, 404);
		});
	const courierId = relationId(shipment.courier);
	if (courierId) {
		const courierRole = await resolveCourierRole(payload, caller.id, courierId);
		if (
			courierRole === "dispatcher" ||
			(courierRole === "rider" &&
				relationId(shipment.rider?.user) === caller.id)
		) {
			return courierShipmentView(payload, shipment, order);
		}
	}
	if (!isModerator(caller) && relationId(order.buyer) === caller.id) {
		return buyerShipmentView(payload, shipment, orderId);
	}
	const fulfillingShopId = relationId(shipment.fulfillingShop);
	const [storefrontRole, fulfillingRole] = await Promise.all([
		resolveShopRole(payload, caller.id, relationId(shipment.storefrontShop)),
		resolveShopRole(payload, caller.id, fulfillingShopId),
	]);
	if (!storefrontRole && !fulfillingRole && !isModerator(caller)) {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
	const { riderLink, courierCost, ...safeShipment } = shipment;
	const view: ShopShipmentView = {
		...safeShipment,
		id: String(shipment.id),
		proof: await proofView(payload, shipment, false),
		timeline: await shipmentTimeline(
			payload,
			orderId,
			String(shipment.id),
			isModerator(caller) ? "staff" : "shop",
		),
		riderLink: riderLink
			? {
					createdAt: riderLink.createdAt ?? null,
					expiresAt: riderLink.expiresAt ?? null,
					revokedAt: riderLink.revokedAt ?? null,
					lastUsedAt: riderLink.lastUsedAt ?? null,
				}
			: null,
	};
	if (fulfillingRole && can(fulfillingRole, "costs.view")) {
		view.courierCost = courierCost ?? null;
	}
	return view;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function shipmentCoordinates(
	value: unknown,
): CourierShipmentView["destination"]["gps"] {
	if (!isRecord(value)) return null;
	return typeof value.lat === "number" && typeof value.lng === "number"
		? { lat: value.lat, lng: value.lng }
		: null;
}

async function courierShipmentView(
	payload: Payload,
	shipment: Shipment,
	order: Order,
): Promise<CourierShipmentView> {
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
	const destination = isRecord(shipment.destination)
		? shipment.destination
		: {};
	const orderItems = await payload.find({
		collection: "order-items",
		where: { order: { equals: String(order.id) } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const shippedQuantities = new Map(
		(shipment.items ?? []).flatMap((line) => {
			const orderItemId = relationId(line.orderItem);
			return orderItemId ? [[orderItemId, line.quantity] as const] : [];
		}),
	);
	const actions: CourierShipmentView["allowedActions"] =
		shipment.status === "pending"
			? ["picked_up"]
			: shipment.status === "picked_up"
				? ["in_transit", "attempt", "handover"]
				: shipment.status === "in_transit"
					? ["attempt", "handover"]
					: shipment.status === "failed" && shipment.redelivery?.rescheduleBy
						? ["picked_up", "attempt"]
						: [];
	const terminal =
		shipment.status === "delivered" ||
		shipment.status === "returned" ||
		shipment.status === "cancelled" ||
		(shipment.status === "failed" && Boolean(shipment.finalFailure?.at));
	const phone = terminal ? null : nullableString(destination.phone);
	const proof = await proofView(payload, shipment, false);
	return {
		id: String(shipment.id),
		shipmentNumber: shipment.shipmentNumber,
		status: shipment.status,
		storefrontName: shop?.name ?? "",
		destination: {
			recipientFirstName:
				nullableString(destination.recipientName)?.trim().split(/\s+/)[0] ?? "",
			phone,
			city: nullableString(destination.city) ?? "",
			district: nullableString(destination.district),
			landmark: nullableString(destination.landmark),
			gps: shipmentCoordinates(destination.gps),
		},
		expectedCod:
			order.paymentMethod === "cod"
				? (shipment.codCollection?.expectedAmount ??
					order.amounts?.total ??
					null)
				: null,
		items: orderItems.docs.flatMap((item) => {
			const quantity = shippedQuantities.get(String(item.id));
			return quantity === undefined
				? []
				: [{ title: item.snapshot?.title ?? "Article", quantity }];
		}),
		attempts: (shipment.attempts ?? []).map((attempt) => ({
			number: attempt.number,
			reason: attempt.reason ?? "other",
			at: attempt.at,
			...(attempt.note ? { note: attempt.note } : {}),
		})),
		proof,
		allowedActions: actions,
	};
}

async function proofView(
	payload: Payload,
	shipment: Shipment,
	buyerAudience: boolean,
): Promise<ShipmentProofView> {
	const proof = shipment.proof;
	if (!proof?.handoverMethod) return null;
	const photoId = relationId(proof.photo);
	let photoUrl: string | null = null;
	if (photoId) {
		const photo = await payload
			.findByID({
				collection: "delivery-proofs",
				id: photoId,
				depth: 0,
				overrideAccess: true,
			})
			.catch(() => null);
		const buyerMayView =
			!buyerAudience ||
			photo?.kind === "handover" ||
			photo?.kind === "declaration";
		if (
			photo?.filename &&
			relationId(photo.shipment) === String(shipment.id) &&
			buyerMayView
		) {
			const signed = await createSignedDocumentUrl(
				{
					id: String(photo.id),
					filename: photo.filename,
					mimeType: photo.mimeType,
					prefix: "delivery-proofs",
				},
				600,
				"/api/delivery-proofs/files",
			);
			photoUrl = signed.url;
		}
	}
	return {
		handoverMethod: proof.handoverMethod,
		capturedAt: proof.capturedAt ?? shipment.deliveredAt ?? "",
		photoUrl,
		codeVerified: proof.handoverMethod === "otp",
	};
}

async function buyerShipmentView(
	payload: Payload,
	shipment: Shipment,
	orderId: string,
): Promise<BuyerShipmentView> {
	const terminalAt =
		shipment.deliveredAt ?? shipment.returnedAt ?? shipment.cancelledAt ?? null;
	const rescheduleBy = shipment.redelivery?.rescheduleBy;
	const canReschedule = Boolean(
		shipment.status === "failed" &&
			rescheduleBy &&
			Date.parse(rescheduleBy) > Date.now(),
	);
	return {
		id: String(shipment.id),
		shipmentNumber: shipment.shipmentNumber,
		status: shipment.status,
		method: shipment.method,
		promisedBy: timestamp(shipment.promisedBy),
		stepper: {
			readyAt: timestamp(shipment.readyForPickupAt),
			pickedUpAt: timestamp(shipment.pickedUpAt),
			inTransitAt: timestamp(shipment.inTransitAt),
			terminalAt,
		},
		rider: activeRider(shipment),
		attempts: (shipment.attempts ?? []).map((attempt) => ({
			number: attempt.number,
			reason: attempt.reason ?? "other",
			at: attempt.at,
		})),
		redelivery: rescheduleView(shipment),
		pickup: await buyerPickupView(payload, shipment),
		trackingUrl: shipment.trackingUrl ?? null,
		proof: await proofView(payload, shipment, true),
		timeline: await shipmentTimeline(
			payload,
			orderId,
			String(shipment.id),
			"buyer",
		),
		canReschedule,
	};
}

async function buyerPickupView(
	payload: Payload,
	shipment: Shipment,
): Promise<BuyerShipmentView["pickup"]> {
	const locationId = relationId(shipment.pickupLocation);
	if (!locationId) return null;
	const location = await payload
		.findByID({
			collection: "shop-locations",
			id: locationId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!location) return null;
	const gps = shipmentCoordinates(location.gps);
	if (!gps) return null;
	const hours =
		location.openingHoursNote ??
		(location.openingHours ?? [])
			.map((row) => `${row.day} ${row.opens}-${row.closes}`)
			.join(", ");
	return {
		locationName: location.name,
		landmark: location.landmark,
		address: location.address ?? null,
		gps,
		hours,
		pickupDeadline: shipment.pickupDeadline ?? null,
	};
}

async function shipmentTimeline(
	payload: Payload,
	orderId: string,
	shipmentId: string,
	audience: "buyer" | "shop" | "staff",
): Promise<Array<{ type: string; at: string }>> {
	const visible =
		audience === "buyer"
			? ["buyer", "both"]
			: audience === "shop"
				? ["shop", "both"]
				: null;
	const visibilityWhere = visible ? [{ visibility: { in: visible } }] : [];
	const [orderEvents, shipmentEvents] = await Promise.all([
		payload.find({
			collection: "order-events",
			where: {
				and: [{ order: { equals: orderId } }, ...visibilityWhere],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		}),
		payload.find({
			collection: "shipment-events",
			where: {
				and: [{ shipment: { equals: shipmentId } }, ...visibilityWhere],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		}),
	]);
	return [
		...orderEvents.docs.map((event) => ({
			id: String(event.id),
			type: event.type,
			at: event.createdAt,
		})),
		...shipmentEvents.docs.map((event) => ({
			id: String(event.id),
			type: event.type,
			at: event.occurredAt,
		})),
	]
		.sort(
			(left, right) =>
				left.at.localeCompare(right.at) || left.id.localeCompare(right.id),
		)
		.map(({ type, at }) => ({ type, at }));
}

export async function getOrderShipmentsForBuyer(
	payload: Payload,
	orderId: string,
	caller: OrderViewer,
): Promise<BuyerShipmentView[]> {
	const { audience } = await requireOrderAudience(payload, caller, orderId);
	if (audience.kind !== "buyer") {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
	const rows = await payload.find({
		collection: "shipments",
		where: { order: { equals: orderId } },
		limit: 0,
		pagination: false,
		sort: "createdAt",
		depth: 0,
		overrideAccess: true,
	});
	const views = await Promise.all(
		rows.docs.map((shipment) => shipmentViewFor(payload, shipment, caller)),
	);
	return views.map((view) => {
		if (!("canReschedule" in view)) {
			throw new ServiceError(ERROR_CODES.notFound, 404);
		}
		return view;
	});
}
