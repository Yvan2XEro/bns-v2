import type { Payload, PayloadRequest } from "payload";
import { z } from "zod";
import type { PublicPickupPoint } from "../../contracts/publicPickupPoint";
import { queueSearchEvent } from "../../hooks/searchEvents";
import { ERROR_CODES } from "../../lib/errors";
import { isLaunchCityKey, type LaunchCityKey } from "../../lib/launchCities";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import { RetryTransaction, withTransaction } from "../../lib/transactions";
import type { ShopLocation } from "../../payload-types";
import { requireShopPermission } from "../shopGuards";
import type { ServiceUser } from "../shops";

const hoursSchema = z.array(
	z.object({
		day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
		opens: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
		closes: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
	}),
);
const locationSchema = z.object({
	name: z.string().trim().min(2).max(60),
	city: z.custom<LaunchCityKey>(isLaunchCityKey),
	district: z.string().trim().min(2).max(100),
	address: z.string().trim().max(200).nullable().optional(),
	landmark: z.string().trim().min(5).max(200),
	gps: z.object({
		lat: z.number().min(-90).max(90),
		lng: z.number().min(-180).max(180),
	}),
	phone: z.string().trim().max(30).nullable().optional(),
	openingHours: hoursSchema.default([]),
	openingHoursNote: z.string().trim().max(200).nullable().optional(),
	pickupEnabled: z.boolean().default(false),
	pickupFee: z.number().int().min(0).max(5000).default(0),
	holdDays: z.number().int().min(1).max(14).default(7),
	preparationHours: z.number().int().min(0).max(72).default(2),
	isDispatchOrigin: z.boolean().default(false),
	isDefaultOrigin: z.boolean().default(false),
	active: z.boolean().default(true),
});
type LocationInput = z.output<typeof locationSchema>;

function invalidLocation(): ServiceError {
	return new ServiceError(ERROR_CODES.deliveryLocationInvalid, 400);
}

function normalize(input: LocationInput): LocationInput {
	if (input.openingHours.some((row) => row.opens >= row.closes))
		throw invalidLocation();
	if (input.pickupEnabled && input.openingHours.length === 0)
		throw invalidLocation();
	if (input.isDefaultOrigin && (!input.isDispatchOrigin || !input.active))
		throw invalidLocation();
	return input;
}

function toData(input: LocationInput, shopId: string) {
	return { ...input, shop: shopId };
}

async function requireManager(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
) {
	return requireShopPermission(payload, user, shopId, "settings.edit", {
		writable: true,
	});
}

async function setDefaultOrigin(
	req: PayloadRequest,
	shopId: string,
	locationId: string,
): Promise<void> {
	const current = await req.payload.find({
		collection: "shop-locations",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ isDefaultOrigin: { equals: true } },
				{ id: { not_equals: locationId } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	for (const row of current.docs) {
		await req.payload.update({
			collection: "shop-locations",
			id: String(row.id),
			data: { isDefaultOrigin: false },
			depth: 0,
			overrideAccess: true,
			req,
		});
	}
	try {
		await req.payload.update({
			collection: "shop-locations",
			id: locationId,
			data: { isDispatchOrigin: true, isDefaultOrigin: true },
			depth: 0,
			overrideAccess: true,
			req,
		});
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === 11000
		)
			throw new RetryTransaction("concurrent default delivery origin change");
		throw error;
	}
}

async function ensureDefaultOrigin(
	req: PayloadRequest,
	shopId: string,
	options: { preferredId?: string; excludeId?: string } = {},
): Promise<void> {
	const origins = await req.payload.find({
		collection: "shop-locations",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ active: { equals: true } },
				{ isDispatchOrigin: { equals: true } },
			],
		},
		limit: 0,
		pagination: false,
		sort: "createdAt",
		depth: 0,
		overrideAccess: true,
		req,
	});
	const preferred = origins.docs.find(
		(origin) => String(origin.id) === options.preferredId,
	);
	if (preferred) {
		await setDefaultOrigin(req, shopId, String(preferred.id));
		return;
	}
	if (origins.docs.some((origin) => origin.isDefaultOrigin === true)) return;
	const target =
		origins.docs.find((origin) => String(origin.id) !== options.excludeId) ??
		origins.docs[0];
	if (target) {
		await setDefaultOrigin(req, shopId, String(target.id));
		return;
	}
	await req.payload.update({
		collection: "shop-locations",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ isDefaultOrigin: { equals: true } },
			],
		},
		data: { isDefaultOrigin: false },
		depth: 0,
		overrideAccess: true,
		req,
	});
}

export async function createLocation(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: unknown,
): Promise<ShopLocation> {
	await requireManager(payload, user, shopId);
	const parsed = locationSchema.safeParse(input);
	if (!parsed.success) throw invalidLocation();
	const data = normalize(parsed.data);
	return withTransaction(
		payload,
		async (req) => {
			const count = await req.payload.count({
				collection: "shop-locations",
				where: { shop: { equals: shopId } },
				overrideAccess: true,
				req,
			});
			if (count.totalDocs >= 10)
				throw new ServiceError(ERROR_CODES.deliveryLocationLimitReached, 409);
			const location = await req.payload.create({
				collection: "shop-locations",
				data: toData({ ...data, isDefaultOrigin: false }, shopId),
				depth: 0,
				overrideAccess: true,
				req,
			});
			await ensureDefaultOrigin(req, shopId, {
				...(data.isDefaultOrigin ? { preferredId: String(location.id) } : {}),
			});
			await queueSearchEvent(req, "shop.updated", shopId);
			return req.payload.findByID({
				collection: "shop-locations",
				id: String(location.id),
				depth: 0,
				overrideAccess: true,
				req,
			});
		},
		{ user },
	);
}

export async function updateLocation(
	payload: Payload,
	user: ServiceUser,
	locationId: string,
	input: unknown,
): Promise<ShopLocation> {
	const current = await payload.findByID({
		collection: "shop-locations",
		id: locationId,
		depth: 0,
		overrideAccess: true,
	});
	const shopId = relationId(current.shop);
	if (!shopId) throw new ServiceError(ERROR_CODES.shopNotFound, 404);
	await requireManager(payload, user, shopId);
	const patch = locationSchema.partial().safeParse(input);
	if (!patch.success) throw invalidLocation();
	const merged = { ...current, ...patch.data };
	if (merged.active === false) merged.isDefaultOrigin = false;
	const candidate = locationSchema.safeParse(merged);
	if (!candidate.success) throw invalidLocation();
	const data = normalize(candidate.data);
	return withTransaction(
		payload,
		async (req) => {
			await req.payload.update({
				collection: "shop-locations",
				id: locationId,
				data: toData({ ...data, isDefaultOrigin: false }, shopId),
				depth: 0,
				overrideAccess: true,
				req,
			});
			await ensureDefaultOrigin(req, shopId, {
				...(data.isDefaultOrigin ? { preferredId: locationId } : {}),
				...(current.isDefaultOrigin ? { excludeId: locationId } : {}),
			});
			await queueSearchEvent(req, "shop.updated", shopId);
			return req.payload.findByID({
				collection: "shop-locations",
				id: locationId,
				depth: 0,
				overrideAccess: true,
				req,
			});
		},
		{ user },
	);
}

export async function deactivateLocation(
	payload: Payload,
	user: ServiceUser,
	locationId: string,
): Promise<ShopLocation> {
	const current = await payload.findByID({
		collection: "shop-locations",
		id: locationId,
		depth: 0,
		overrideAccess: true,
	});
	const shopId = relationId(current.shop);
	if (!shopId) throw new ServiceError(ERROR_CODES.shopNotFound, 404);
	await requireManager(payload, user, shopId);
	return withTransaction(
		payload,
		async (req) => {
			await req.payload.update({
				collection: "shop-locations",
				id: locationId,
				data: { active: false, isDefaultOrigin: false },
				depth: 0,
				overrideAccess: true,
				req,
			});
			await ensureDefaultOrigin(req, shopId, {
				...(current.isDefaultOrigin ? { excludeId: locationId } : {}),
			});
			await queueSearchEvent(req, "shop.updated", shopId);
			return req.payload.findByID({
				collection: "shop-locations",
				id: locationId,
				depth: 0,
				overrideAccess: true,
				req,
			});
		},
		{ user },
	);
}

export async function listShopLocations(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
): Promise<ShopLocation[]> {
	await requireManager(payload, user, shopId);
	const result = await payload.find({
		collection: "shop-locations",
		where: { shop: { equals: shopId } },
		limit: 100,
		sort: "createdAt",
		depth: 0,
		overrideAccess: true,
	});
	return result.docs;
}

export async function defaultOrigin(
	payload: Payload,
	shopId: string,
	req?: PayloadRequest,
): Promise<ShopLocation | null> {
	const result = await payload.find({
		collection: "shop-locations",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ active: { equals: true } },
				{ isDispatchOrigin: { equals: true } },
				{ isDefaultOrigin: { equals: true } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	return result.docs[0] ?? null;
}

export async function publicPickupPoints(
	payload: Payload,
	handle: string,
): Promise<PublicPickupPoint[]> {
	const shops = await payload.find({
		collection: "shops",
		where: {
			and: [{ handle: { equals: handle } }, { status: { equals: "active" } }],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const shop = shops.docs[0];
	if (!shop) throw new ServiceError(ERROR_CODES.shopNotFound, 404);
	const result = await payload.find({
		collection: "shop-locations",
		where: {
			and: [
				{ shop: { equals: String(shop.id) } },
				{ active: { equals: true } },
				{ pickupEnabled: { equals: true } },
			],
		},
		limit: 100,
		sort: "name",
		depth: 0,
		overrideAccess: true,
	});
	return result.docs.map((location) => {
		const publicLocation: PublicPickupPoint = {
			id: String(location.id),
			name: location.name,
			city: location.city,
			district: location.district,
			address: location.address ?? null,
			landmark: location.landmark,
			gps: location.gps,
			openingHours: location.openingHours,
			openingHoursNote: location.openingHoursNote ?? null,
			pickupFee: location.pickupFee ?? 0,
			holdDays: location.holdDays ?? 7,
			preparationHours: location.preparationHours ?? 2,
		};
		if (location.phone?.trim()) publicLocation.phone = location.phone;
		return publicLocation;
	});
}
