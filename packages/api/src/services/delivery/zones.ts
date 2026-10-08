import type { Payload } from "payload";
import { z } from "zod";
import {
	DELIVERY_METHODS,
	DELIVERY_SCOPES,
} from "../../collections/DeliveryZones";
import { queueSearchEvent } from "../../hooks/searchEvents";
import { getDeliverySettings } from "../../lib/deliverySettings";
import { ERROR_CODES } from "../../lib/errors";
import {
	districtKeysOf,
	isDistrictKey,
	isLaunchCityKey,
	type LaunchCityKey,
} from "../../lib/launchCities";
import { getOrderSettings } from "../../lib/orderSettings";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import { withTransaction } from "../../lib/transactions";
import type { DeliveryZone } from "../../payload-types";
import { quoteDelivery } from "../deliveryQuote";
import { requireShopPermission } from "../shopGuards";
import type { ServiceUser } from "../shops";

const zoneInputSchema = z.object({
	name: z.string().trim().min(2).max(40),
	scope: z.enum(DELIVERY_SCOPES),
	city: z.custom<LaunchCityKey>(isLaunchCityKey),
	districts: z.array(z.string()).max(25).default([]),
	destinationCities: z
		.array(z.custom<LaunchCityKey>(isLaunchCityKey))
		.max(2)
		.optional(),
	method: z.enum(DELIVERY_METHODS),
	courier: z.string().trim().min(1).nullable().optional(),
	fee: z.number().int().min(0).max(50_000),
	freeAboveSubtotal: z.number().int().min(0).nullable().optional(),
	minOrderSubtotal: z.number().int().min(0).nullable().optional(),
	etaMinHours: z.number().int().min(1).max(720),
	etaMaxHours: z.number().int().min(1).max(720),
	cutoffTime: z
		.string()
		.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
		.nullable()
		.optional(),
	deliveryDays: z
		.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]))
		.min(1),
	codAllowed: z.boolean().default(true),
	active: z.boolean().default(true),
	sortOrder: z.number().int().default(0),
});

export type ZoneInput = z.input<typeof zoneInputSchema>;
type ParsedZone = z.output<typeof zoneInputSchema>;

function invalidZone(): ServiceError {
	return new ServiceError(ERROR_CODES.deliveryZoneInvalid, 400);
}

function districtsOf(zone: DeliveryZone): string[] {
	return (zone.districts ?? []).flatMap((district) =>
		typeof district.key === "string" ? [district.key] : [],
	);
}

async function assertZoneInput(
	payload: Payload,
	shopId: string,
	input: ParsedZone,
	existingZoneId?: string,
): Promise<void> {
	if (input.etaMinHours > input.etaMaxHours) throw invalidZone();
	if (input.districts.some((district) => !isDistrictKey(input.city, district)))
		throw invalidZone();
	if (input.scope === "same_city") {
		if (input.destinationCities?.length) throw invalidZone();
		const locations = await payload.find({
			collection: "shop-locations",
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ active: { equals: true } },
					{ isDispatchOrigin: { equals: true } },
					{ city: { equals: input.city } },
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		const shop = await payload.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
		});
		if (locations.totalDocs === 0 && shop.location?.city !== input.city)
			throw new ServiceError(ERROR_CODES.deliveryCityNotLaunched, 400);
	} else {
		const settings = await getDeliverySettings(payload);
		if (!settings.intercityEnabled) throw invalidZone();
		if (!input.destinationCities?.length) throw invalidZone();
	}
	if (input.method === "courier") {
		if (!input.courier) throw invalidZone();
		const courier = await payload
			.findByID({
				collection: "couriers",
				id: input.courier,
				depth: 0,
				overrideAccess: true,
			})
			.catch(() => null);
		const requiredCities =
			input.scope === "intercity"
				? [input.city, ...(input.destinationCities ?? [])]
				: [input.city];
		if (
			!courier ||
			courier.status !== "active" ||
			requiredCities.some((city) => !courier.cities.includes(city))
		)
			throw new ServiceError(ERROR_CODES.courierCityNotServed, 400);
	} else if (input.courier) {
		throw invalidZone();
	}
	if (!input.active) return;

	const zones = await payload.find({
		collection: "delivery-zones",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ active: { equals: true } },
				{ scope: { equals: input.scope } },
				{ method: { equals: input.method } },
				{ city: { equals: input.city } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const conflict = zones.docs.some((zone) => {
		if (String(zone.id) === existingZoneId) return false;
		const existingDistricts = districtsOf(zone);
		if (!input.districts.length || !existingDistricts.length)
			return !input.districts.length && !existingDistricts.length;
		return input.districts.some((district) =>
			existingDistricts.includes(district),
		);
	});
	if (conflict) throw new ServiceError(ERROR_CODES.deliveryZoneOverlap, 409);
}

async function requireZoneManager(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
): Promise<void> {
	await requireShopPermission(payload, user, shopId, "settings.edit", {
		writable: true,
	});
}

export async function listShopZones(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
): Promise<DeliveryZone[]> {
	await requireZoneManager(payload, user, shopId);
	const result = await payload.find({
		collection: "delivery-zones",
		where: { shop: { equals: shopId } },
		limit: 100,
		depth: 1,
		sort: "sortOrder",
		overrideAccess: true,
	});
	return result.docs;
}

export async function createZone(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: unknown,
): Promise<DeliveryZone> {
	await requireZoneManager(payload, user, shopId);
	const parsed = zoneInputSchema.safeParse(input);
	if (!parsed.success) throw invalidZone();
	return withTransaction(
		payload,
		async (req) => {
			const count = await req.payload.count({
				collection: "delivery-zones",
				where: { shop: { equals: shopId } },
				overrideAccess: true,
				req,
			});
			if (count.totalDocs >= 30)
				throw new ServiceError(ERROR_CODES.deliveryZoneLimitReached, 409);
			await assertZoneInput(req.payload, shopId, parsed.data);
			const zone = await req.payload.create({
				collection: "delivery-zones",
				req,
				overrideAccess: true,
				data: {
					...parsed.data,
					shop: shopId,
					districts: parsed.data.districts.map((key) => ({ key })),
					...(parsed.data.courier ? { courier: parsed.data.courier } : {}),
				},
			});
			await queueSearchEvent(req, "shop.updated", shopId);
			return zone;
		},
		{ user },
	);
}

export async function updateZone(
	payload: Payload,
	user: ServiceUser,
	zoneIdValue: string,
	input: unknown,
): Promise<DeliveryZone> {
	const current = await payload.findByID({
		collection: "delivery-zones",
		id: zoneIdValue,
		depth: 0,
		overrideAccess: true,
	});
	const shopId = relationId(current.shop);
	if (!shopId) throw new ServiceError(ERROR_CODES.shopNotFound, 404);
	await requireZoneManager(payload, user, shopId);
	const patchSchema = zoneInputSchema.partial();
	const parsedPatch = patchSchema.safeParse(input);
	if (!parsedPatch.success) throw invalidZone();
	const currentInput: ParsedZone = {
		name: current.name,
		scope: current.scope,
		city: current.city,
		districts: districtsOf(current),
		destinationCities: current.destinationCities ?? undefined,
		method: current.method,
		courier: relationId(current.courier) ?? undefined,
		fee: current.fee,
		freeAboveSubtotal: current.freeAboveSubtotal,
		minOrderSubtotal: current.minOrderSubtotal,
		etaMinHours: current.etaMinHours,
		etaMaxHours: current.etaMaxHours,
		cutoffTime: current.cutoffTime,
		deliveryDays: current.deliveryDays,
		codAllowed: current.codAllowed ?? true,
		active: current.active ?? true,
		sortOrder: current.sortOrder ?? 0,
	};
	const candidate = zoneInputSchema.safeParse({
		...currentInput,
		...parsedPatch.data,
	});
	if (!candidate.success) throw invalidZone();
	return withTransaction(
		payload,
		async (req) => {
			await assertZoneInput(req.payload, shopId, candidate.data, zoneIdValue);
			await req.payload.update({
				collection: "delivery-zones",
				id: zoneIdValue,
				req,
				overrideAccess: true,
				data: {
					...candidate.data,
					districts: candidate.data.districts.map((key) => ({ key })),
					courier: candidate.data.courier ?? null,
				},
			});
			await queueSearchEvent(req, "shop.updated", shopId);
			return req.payload.findByID({
				collection: "delivery-zones",
				id: zoneIdValue,
				req,
				depth: 0,
				overrideAccess: true,
			});
		},
		{ user },
	);
}

export async function deactivateZone(
	payload: Payload,
	user: ServiceUser,
	zoneIdValue: string,
): Promise<{ deleted: boolean; deactivated: boolean }> {
	const current = await payload.findByID({
		collection: "delivery-zones",
		id: zoneIdValue,
		depth: 0,
		overrideAccess: true,
	});
	const shopId = relationId(current.shop);
	if (!shopId) throw new ServiceError(ERROR_CODES.shopNotFound, 404);
	await requireZoneManager(payload, user, shopId);
	return withTransaction(
		payload,
		async (req) => {
			const [orders, shipments] = await Promise.all([
				req.payload.find({
					collection: "orders",
					where: { "delivery.zone": { equals: zoneIdValue } },
					limit: 1,
					depth: 0,
					overrideAccess: true,
					req,
				}),
				req.payload.find({
					collection: "shipments",
					where: { zone: { equals: zoneIdValue } },
					limit: 1,
					depth: 0,
					overrideAccess: true,
					req,
				}),
			]);
			if (orders.totalDocs > 0 || shipments.totalDocs > 0) {
				await req.payload.update({
					collection: "delivery-zones",
					id: zoneIdValue,
					req,
					overrideAccess: true,
					data: { active: false },
				});
				await queueSearchEvent(req, "shop.updated", shopId);
				return { deleted: false, deactivated: true };
			}
			await req.payload.delete({
				collection: "delivery-zones",
				id: zoneIdValue,
				req,
				overrideAccess: true,
			});
			await queueSearchEvent(req, "shop.updated", shopId);
			return { deleted: true, deactivated: false };
		},
		{ user },
	);
}

export async function resolveZonesFor(
	payload: Payload,
	shopId: string,
	destination: { city: LaunchCityKey; district?: string },
): Promise<Map<DeliveryZone["method"], DeliveryZone>> {
	const result = await payload.find({
		collection: "delivery-zones",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ city: { equals: destination.city } },
				{ active: { equals: true } },
				{ scope: { equals: "same_city" } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 1,
		overrideAccess: true,
	});
	const resolved = new Map<DeliveryZone["method"], DeliveryZone>();
	for (const zone of result.docs) {
		const districtKeys = districtsOf(zone);
		const isOtherDistrict =
			destination.district === `${destination.city}.other`;
		const matchesDistrict = Boolean(
			!isOtherDistrict &&
				destination.district &&
				districtKeys.includes(destination.district),
		);
		const isWholeCity = districtKeys.length === 0;
		if (matchesDistrict || isWholeCity) {
			const existing = resolved.get(zone.method);
			if (
				!existing ||
				(districtKeys.length > 0 && districtsOf(existing).length === 0)
			)
				resolved.set(zone.method, zone);
		}
	}
	return resolved;
}

export async function testShopDelivery(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	destination: { city: LaunchCityKey; district?: string; subtotal: number },
) {
	const { shop } = await requireZoneManager(payload, user, shopId).then(() =>
		payload
			.findByID({
				collection: "shops",
				id: shopId,
				depth: 0,
				overrideAccess: true,
			})
			.then((shop) => ({ shop })),
	);
	return quoteDelivery({
		payload,
		shop,
		items: [],
		subtotal: destination.subtotal,
		destination,
		settings: await getOrderSettings(payload),
	});
}

export function zoneDistrictOptions(city: LaunchCityKey): readonly string[] {
	return districtKeysOf(city);
}
