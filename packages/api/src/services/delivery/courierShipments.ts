import type { Payload, PayloadRequest, Where } from "payload";
import { ORDER_SERVICE_CONTEXT } from "../../collections/Orders";
import { getCourierProvider } from "../../lib/delivery";
import type {
	CourierAddress,
	CourierQuote,
	CreateCourierShipmentParams,
} from "../../lib/delivery/types";
import { getDeliverySettings } from "../../lib/deliverySettings";
import { ERROR_CODES } from "../../lib/errors";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../../lib/transactions";
import type { Courier, Order, Shipment, Shop } from "../../payload-types";
import {
	appendShipmentEvent,
	applyShipmentTransition,
} from "./shipmentTransitions";

type CarrierChoice =
	| { carrier: "self" }
	| { carrier: "courier"; courierId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function courierAddress(value: unknown, origin: boolean): CourierAddress {
	if (!isRecord(value)) {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	const record = value;
	const city = typeof record.city === "string" ? record.city : "";
	const contactName = origin
		? typeof record.name === "string"
			? record.name
			: "Shop"
		: typeof record.recipientName === "string"
			? record.recipientName
			: "Buyer";
	const phone = typeof record.phone === "string" ? record.phone : "";
	const gpsValue = record.gps;
	const gps =
		typeof gpsValue === "object" &&
		gpsValue !== null &&
		"lat" in gpsValue &&
		"lng" in gpsValue &&
		typeof gpsValue.lat === "number" &&
		typeof gpsValue.lng === "number"
			? { lat: gpsValue.lat, lng: gpsValue.lng }
			: undefined;
	return {
		contactName,
		phone,
		city,
		...(typeof record.district === "string"
			? { district: record.district }
			: {}),
		...(typeof record.address === "string"
			? { addressLine: record.address }
			: {}),
		...(typeof record.landmark === "string"
			? { landmark: record.landmark }
			: {}),
		...(gps ? { gps } : {}),
	};
}

function deliveryScope(
	origin: CourierAddress,
	destination: CourierAddress,
): "same_city" | "intercity" {
	return origin.city === destination.city ? "same_city" : "intercity";
}

async function courierQuote(
	payload: Payload,
	shipment: Shipment,
	courier: Courier,
): Promise<CourierQuote> {
	const provider = getCourierProvider(courier.provider, { payload, courier });
	const order = await payload.findByID({
		collection: "orders",
		id: relationId(shipment.order) ?? "",
		depth: 0,
		overrideAccess: true,
	});
	const origin = courierAddress(shipment.origin, true);
	const destination = courierAddress(shipment.destination, false);
	const scope = deliveryScope(origin, destination);
	if (!courier.scopes.includes(scope)) {
		throw new ServiceError(ERROR_CODES.courierCityNotServed, 409);
	}
	return provider.quote({
		courierKey: courier.key,
		scope,
		origin,
		destination,
		parcel: {
			itemsCount:
				shipment.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
			weightGrams: 0,
			declaredValue: order.amounts?.total ?? 0,
		},
		...(order.paymentMethod === "cod"
			? { cod: { amount: order.amounts?.total ?? 0, currency: "XAF" as const } }
			: {}),
		readyAt: new Date(),
	});
}

async function scheduleProviderCreate(
	payload: Payload,
	shipment: Shipment,
	courier: Courier,
	quote: CourierQuote,
	storefront: Shop,
): Promise<void> {
	const provider = getCourierProvider(courier.provider, { payload, courier });
	const order = await payload.findByID({
		collection: "orders",
		id: relationId(shipment.order) ?? "",
		depth: 0,
		overrideAccess: true,
	});
	const origin = courierAddress(shipment.origin, true);
	const destination = courierAddress(shipment.destination, false);
	const scope = deliveryScope(origin, destination);
	const params: CreateCourierShipmentParams = {
		courierKey: courier.key,
		scope,
		origin,
		destination,
		parcel: {
			itemsCount:
				shipment.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
			weightGrams: 0,
			declaredValue: order.amounts?.total ?? 0,
		},
		...(order.paymentMethod === "cod"
			? { cod: { amount: order.amounts?.total ?? 0, currency: "XAF" as const } }
			: {}),
		readyAt: new Date(),
		reference: shipment.shipmentNumber,
		...(quote.providerQuoteId
			? { providerQuoteId: quote.providerQuoteId }
			: {}),
		callbackUrl: `${process.env.PAYLOAD_PUBLIC_SERVER_URL ?? ""}/api/public/delivery/webhook/${courier.provider}`,
		storefrontName: storefront.name,
	};
	const created = await provider.create(params);
	await payload.update({
		collection: "shipments",
		id: String(shipment.id),
		overrideAccess: true,
		context: { shipmentService: true },
		data: {
			providerShipmentId: created.providerShipmentId,
			provider: courier.provider,
			trackingCode: created.trackingCode,
			trackingUrl: created.trackingUrl,
		},
	});
}

async function queueProviderCreate(
	req: PayloadRequest,
	shipment: Shipment,
	courier: Courier,
	quote: CourierQuote,
): Promise<void> {
	const storefront = await req.payload.findByID({
		collection: "shops",
		id: relationId(shipment.storefrontShop) ?? "",
		depth: 0,
		overrideAccess: true,
		req,
	});
	const run = () =>
		scheduleProviderCreate(req.payload, shipment, courier, quote, storefront);
	if (!onCommit(commitContextOf(req), run)) await run();
}

export async function switchShipmentCarrier(
	req: PayloadRequest,
	shipment: Shipment,
	choice: CarrierChoice,
	replacementNumber: string,
): Promise<{ shipment: Shipment; quote: CourierQuote | null }> {
	if (shipment.status !== "pending") {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	const payload = req.payload;
	const settings = await getDeliverySettings(payload);
	let courier: Courier | undefined;
	let quote: CourierQuote | null = null;
	if (choice.carrier === "courier") {
		if (!settings.zonesEnabled || !settings.couriersEnabled) {
			throw new ServiceError(ERROR_CODES.courierUnavailable, 409);
		}
		courier = await payload.findByID({
			collection: "couriers",
			id: choice.courierId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (courier.status !== "active") {
			throw new ServiceError(ERROR_CODES.courierUnavailable, 409);
		}
		quote = await courierQuote(payload, shipment, courier);
	}
	if (
		shipment.carrier === choice.carrier &&
		(choice.carrier === "self" ||
			relationId(shipment.courier) === choice.courierId)
	) {
		if (
			choice.carrier === "courier" &&
			courier &&
			quote &&
			!shipment.providerShipmentId
		) {
			await queueProviderCreate(req, shipment, courier, quote);
		}
		return { shipment, quote };
	}
	const oldCourier = shipment.courier
		? await payload.findByID({
				collection: "couriers",
				id: relationId(shipment.courier) ?? "",
				depth: 0,
				overrideAccess: true,
				req,
			})
		: undefined;
	const cancelled = await applyShipmentTransition(req, shipment, "cancelled", {
		type: "shipment.cancelled",
		actorType: "seller",
		visibility: "both",
		occurredAt: new Date().toISOString(),
		metadata: { reason: "carrier_changed" },
	});
	const replacement = await payload.create({
		collection: "shipments",
		req,
		overrideAccess: true,
		context: { shipmentService: true },
		data: {
			shipmentNumber: replacementNumber,
			order: relationId(shipment.order) ?? "",
			storefrontShop: relationId(shipment.storefrontShop) ?? "",
			fulfillingShop: relationId(shipment.fulfillingShop) ?? "",
			items:
				shipment.items?.map((item) => ({
					orderItem: relationId(item.orderItem) ?? "",
					quantity: item.quantity,
				})) ?? [],
			method: shipment.method,
			carrier: choice.carrier,
			...(courier
				? {
						courier: String(courier.id),
						provider: courier.provider,
						courierCost: quote?.amount ?? 0,
					}
				: {}),
			...(shipment.zone
				? { zone: relationId(shipment.zone) ?? undefined }
				: {}),
			...(shipment.pickupLocation
				? { pickupLocation: relationId(shipment.pickupLocation) ?? undefined }
				: {}),
			origin: shipment.origin,
			destination: shipment.destination,
			fee: shipment.fee,
			status: "pending",
		},
	});
	if (oldCourier && shipment.providerShipmentId) {
		const oldProvider = getCourierProvider(oldCourier.provider, {
			payload,
			courier: oldCourier,
		});
		const result = await oldProvider.cancel({
			providerShipmentId: shipment.providerShipmentId,
			reason: "carrier_changed",
		});
		if (!result.cancelled) {
			throw new ServiceError(ERROR_CODES.courierCancelRefused, 409);
		}
	}
	await appendShipmentEvent(req, replacement, {
		type: "shipment.created",
		actorType: "seller",
		visibility: "both",
		occurredAt: new Date().toISOString(),
		metadata: { replacedShipmentId: String(cancelled.shipment.id) },
	});
	const orderId = relationId(shipment.order);
	if (orderId) {
		const order: Order = await payload.findByID({
			collection: "orders",
			id: orderId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		await payload.update({
			collection: "orders",
			id: orderId,
			req,
			overrideAccess: true,
			context: ORDER_SERVICE_CONTEXT,
			data: {
				shipments: [
					...new Set([
						...(order.shipments ?? [])
							.map((item) => relationId(item))
							.filter((id): id is string => id !== null),
						String(cancelled.shipment.id),
						String(replacement.id),
					]),
				],
			},
		});
	}
	if (courier && quote) {
		await queueProviderCreate(req, replacement, courier, quote);
	}
	return { shipment: replacement, quote };
}

export async function flagCourierCancellationRefused(
	payload: Payload,
	shipmentId: string,
): Promise<void> {
	await withTransaction(payload, async (req) => {
		const shipment = await req.payload.findByID({
			collection: "shipments",
			id: shipmentId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (shipment.status !== "pending") return;
		const flags = new Set<NonNullable<Shipment["flags"]>[number]>([
			...(shipment.flags ?? []),
			"courier_cancel_refused",
		]);
		await req.payload.update({
			collection: "shipments",
			id: shipmentId,
			req,
			overrideAccess: true,
			context: { shipmentService: true },
			data: {
				flags: [...flags],
			},
		});
	});
}

export async function listCourierShipments(
	payload: Payload,
	userId: string,
	input: { status?: string; cursor?: string },
): Promise<{ docs: Shipment[]; nextCursor: string | null }> {
	const memberships = await payload.find({
		collection: "courier-members",
		where: {
			and: [{ user: { equals: userId } }, { status: { equals: "active" } }],
		},
		limit: 100,
		depth: 0,
		overrideAccess: true,
	});
	const scopes: Where[] = memberships.docs.flatMap((member): Where[] => {
		const courierId = relationId(member.courier);
		if (!courierId) return [];
		if (member.role === "dispatcher")
			return [{ courier: { equals: courierId } }];
		if (member.role === "rider") {
			return [
				{
					and: [
						{ courier: { equals: courierId } },
						{ "rider.user": { equals: userId } },
					],
				},
			];
		}
		return [];
	});
	if (scopes.length === 0) {
		throw new ServiceError(ERROR_CODES.shipmentNotAssigned, 403);
	}
	const where: Where[] = [
		{ or: scopes },
		...(input.status ? [{ status: { equals: input.status } }] : []),
		...(input.cursor ? [{ id: { greater_than: input.cursor } }] : []),
	];
	const result = await payload.find({
		collection: "shipments",
		where: { and: where },
		limit: 51,
		sort: "id",
		depth: 0,
		overrideAccess: true,
	});
	const docs = result.docs.slice(0, 50);
	return {
		docs,
		nextCursor: result.docs.length > 50 ? String(docs.at(-1)?.id ?? "") : null,
	};
}

export async function assignCourierRider(
	req: PayloadRequest,
	shipment: Shipment,
	riderUserId: string,
	assignedBy: string,
): Promise<Shipment> {
	if (shipment.carrier !== "courier" || !shipment.courier) {
		throw new ServiceError(ERROR_CODES.shipmentNotAssigned, 404);
	}
	const members = await req.payload.find({
		collection: "courier-members",
		where: {
			and: [
				{ courier: { equals: relationId(shipment.courier) } },
				{ user: { equals: riderUserId } },
				{ status: { equals: "active" } },
				{ role: { equals: "rider" } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const member = members.docs[0];
	if (!member) throw new ServiceError(ERROR_CODES.shipmentNotAssigned, 404);
	if (!member.phoneSharingConsentAt) {
		throw new ServiceError(ERROR_CODES.shipmentRiderConsentMissing, 409);
	}
	const user = await req.payload.findByID({
		collection: "users",
		id: riderUserId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const occurredAt = new Date().toISOString();
	const updated = await req.payload.update({
		collection: "shipments",
		id: String(shipment.id),
		req,
		overrideAccess: true,
		context: { shipmentService: true },
		data: {
			rider: {
				user: riderUserId,
				name: user.name,
				phone: user.phone ?? "",
				vehicle: member.vehicle ?? "other",
				assignedAt: occurredAt,
				assignedBy,
			},
		},
	});
	await appendShipmentEvent(req, updated, {
		type: "shipment.rider_assigned",
		actorType: "dispatcher",
		actor: assignedBy,
		visibility: "staff",
		occurredAt,
		metadata: { riderUserId },
	});
	return updated;
}

export async function assignShopRider(
	req: PayloadRequest,
	shipment: Shipment,
	input: { userId?: string; name?: string; phone?: string },
	assignedBy: string,
): Promise<Shipment> {
	if (shipment.carrier !== "self" || !shipment.fulfillingShop) {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	let rider: NonNullable<Shipment["rider"]>;
	if (input.userId) {
		const user = await req.payload.findByID({
			collection: "users",
			id: input.userId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const member = await req.payload.find({
			collection: "shop-members",
			where: {
				and: [
					{ shop: { equals: relationId(shipment.fulfillingShop) } },
					{ user: { equals: input.userId } },
					{ status: { equals: "active" } },
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (!member.docs[0]) {
			throw new ServiceError(ERROR_CODES.shipmentNotAssigned, 403);
		}
		rider = {
			user: input.userId,
			name: user.name,
			phone: user.phone ?? "",
			assignedAt: new Date().toISOString(),
			assignedBy,
		};
	} else {
		const name = input.name?.trim();
		const phone = input.phone?.trim();
		if (!name || !phone) throw new ServiceError(ERROR_CODES.badRequest, 400);
		rider = { name, phone, assignedAt: new Date().toISOString(), assignedBy };
		const shopId = relationId(shipment.fulfillingShop);
		if (!shopId) throw new ServiceError(ERROR_CODES.shopNotFound, 404);
		const shop = await req.payload.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const riders = shop.orderSettings?.recentExternalRiders ?? [];
		await req.payload.update({
			collection: "shops",
			id: shopId,
			req,
			overrideAccess: true,
			context: { shopService: true },
			data: {
				orderSettings: {
					...shop.orderSettings,
					recentExternalRiders: [
						{
							name,
							phone,
							lastUsedAt: rider.assignedAt ?? new Date().toISOString(),
						},
						...riders.filter((item) => item.phone !== phone),
					].slice(0, 10),
				},
			},
		});
	}
	const updated = await req.payload.update({
		collection: "shipments",
		id: String(shipment.id),
		req,
		overrideAccess: true,
		context: { shipmentService: true },
		data: { rider },
	});
	await appendShipmentEvent(req, updated, {
		type: "shipment.rider_assigned",
		actorType: "seller",
		actor: assignedBy,
		visibility: "both",
		occurredAt: rider.assignedAt ?? new Date().toISOString(),
		metadata: { external: !input.userId },
	});
	return updated;
}
