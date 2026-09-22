import type { Payload, PayloadRequest } from "payload";
import { isSuspended } from "../access/roles";
import { SHOP_SERVICE_CONTEXT } from "../collections/Shops";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import { type PublicShop, serializePublicShop } from "../lib/publicShop";
import { ServiceError } from "../lib/serviceError";
import {
	addDays,
	closedHandleReleased,
	HANDLE_COOLDOWN_DAYS,
	isPreviousHandleActive,
	nextHandleChangeAt,
	PREVIOUS_HANDLE_TTL_DAYS,
	pruneExpiredHandles,
	releasedHandleFor,
	validateHandle,
} from "../lib/shopHandle";
import { getShopSettings } from "../lib/shopSettings";
import { withTransaction } from "../lib/transactions";
import type { Shop } from "../payload-types";
import { loadPublicShop, requireShopMember } from "./shopGuards";

export interface ServiceUser {
	id: string;
	role?: string | null;
	name?: string | null;
	suspendedAt?: string | Date | null;
	suspendedUntil?: string | Date | null;
}

export interface CreateShopInput {
	handle: unknown;
	name: unknown;
	description?: unknown;
	city?: unknown;
	categories?: unknown;
}

export type HandleAvailability = {
	available: boolean;
	reason: null | "invalid" | "reserved" | "taken";
	handle: string;
};

const HANDLE_ERRORS: Record<
	"invalid" | "reserved" | "taken",
	[ErrorCode, number]
> = {
	invalid: [ERROR_CODES.shopHandleInvalid, 400],
	reserved: [ERROR_CODES.shopHandleReserved, 400],
	taken: [ERROR_CODES.shopHandleTaken, 409],
};

function handleError(reason: "invalid" | "reserved" | "taken"): ServiceError {
	const [code, status] = HANDLE_ERRORS[reason];
	return new ServiceError(code, status);
}

/**
 * Matches Mongo's E11000 and the fake's ValidationError shape alike, so a
 * caught duplicate-key error maps to the shop's own "handle taken" code
 * instead of leaking a raw driver error.
 */
export function isUniqueViolation(error: unknown): boolean {
	const e = error as {
		code?: unknown;
		message?: unknown;
		data?: { errors?: Array<{ message?: unknown }> };
	} | null;
	if (!e) return false;
	if (e.code === 11000) return true;
	const texts = [e.message, ...(e.data?.errors ?? []).map((x) => x.message)];
	return texts.some(
		(t) => typeof t === "string" && t.toLowerCase().includes("unique"),
	);
}

/** The one writer of service-owned shop fields. P2's setShopLevel goes through here. */
export async function writeShop(
	req: PayloadRequest,
	shopId: string,
	data: Record<string, unknown>,
): Promise<Shop> {
	return req.payload.update({
		collection: "shops",
		id: shopId,
		req,
		overrideAccess: true,
		context: SHOP_SERVICE_CONTEXT,
		data: data as Partial<Shop>,
	});
}

export async function checkHandleAvailability(
	payload: Payload,
	raw: unknown,
	options: { now?: Date; excludeShopId?: string } = {},
): Promise<HandleAvailability> {
	const now = options.now ?? new Date();
	const validation = validateHandle(raw);
	if (!validation.ok) {
		return {
			available: false,
			reason: validation.reason,
			handle: validation.handle,
		};
	}
	const handle = validation.handle;
	const taken: HandleAvailability = {
		available: false,
		reason: "taken",
		handle,
	};

	const holders = await payload.find({
		collection: "shops",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		where: { handle: { equals: handle } },
	});
	const holder = holders.docs[0];
	if (holder && holder.id !== options.excludeShopId) {
		const released =
			holder.status === "closed" && closedHandleReleased(holder.closedAt, now);
		if (!released) return taken;
	}

	const previous = await payload.find({
		collection: "shops",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		where: { "previousHandles.handle": { equals: handle } },
	});
	for (const doc of previous.docs) {
		if (doc.id === options.excludeShopId) continue;
		const held = (doc.previousHandles ?? []).some(
			(entry) => entry.handle === handle && isPreviousHandleActive(entry, now),
		);
		if (held) return taken;
	}

	return { available: true, reason: null, handle };
}

/** Frees a closed shop's handle once its 90-day hold is over, so the unique index accepts the new owner. */
export async function releaseClosedHandle(
	req: PayloadRequest,
	handle: string,
	now: Date,
): Promise<void> {
	const holders = await req.payload.find({
		collection: "shops",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		req,
		where: {
			and: [{ handle: { equals: handle } }, { status: { equals: "closed" } }],
		},
	});
	const holder = holders.docs[0];
	if (holder && closedHandleReleased(holder.closedAt, now)) {
		await writeShop(req, holder.id, { handle: releasedHandleFor(holder.id) });
	}
}

function trimmedString(value: unknown, max: number): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, max) : null;
}

export async function createShop(
	payload: Payload,
	user: ServiceUser,
	input: CreateShopInput,
	now: Date = new Date(),
): Promise<PublicShop> {
	const settings = await getShopSettings(payload);
	if (!settings.enabled) throw new ServiceError(ERROR_CODES.shopDisabled, 403);

	const account = await payload.findByID({
		collection: "users",
		id: user.id,
		depth: 1,
		overrideAccess: true,
	});
	// The freshly-read account, not the caller-supplied `user`, is the
	// authority on suspension and phone verification: session data can be stale.
	if (isSuspended(account, now))
		throw new ServiceError(ERROR_CODES.accountSuspended, 403);
	if (!account.phoneVerifiedAt)
		throw new ServiceError(ERROR_CODES.shopPhoneNotVerified, 403);

	const owned = await payload.count({
		collection: "shops",
		overrideAccess: true,
		where: {
			and: [
				{ owner: { equals: user.id } },
				{ status: { in: ["active", "suspended"] } },
			],
		},
	});
	if (owned.totalDocs >= settings.maxPerUser) {
		throw new ServiceError(ERROR_CODES.shopLimitReached, 409);
	}

	const name = typeof input.name === "string" ? input.name.trim() : "";
	if (name.length < 2 || name.length > 60) {
		throw new ServiceError(ERROR_CODES.validation, 400);
	}
	const description = trimmedString(input.description, 1000);
	const categories = Array.isArray(input.categories)
		? [
				...new Set(
					input.categories.filter(
						(c): c is string => typeof c === "string" && c.length > 0,
					),
				),
			]
		: [];
	if (categories.length > 5)
		throw new ServiceError(ERROR_CODES.validation, 400);

	const availability = await checkHandleAvailability(payload, input.handle, {
		now,
	});
	if (!availability.available && availability.reason)
		throw handleError(availability.reason);
	const handle = availability.handle;

	const city = trimmedString(input.city, 80);
	const home = account.homeLocation ?? {};
	const location = city
		? {
				city,
				region: home.city === city ? (home.region ?? null) : null,
				country: home.country ?? "Cameroun",
				countryCode: home.countryCode ?? "CM",
			}
		: undefined;

	try {
		const shop = await withTransaction(
			payload,
			async (req) => {
				await releaseClosedHandle(req, handle, now);
				const created = await payload.create({
					collection: "shops",
					req,
					overrideAccess: true,
					context: SHOP_SERVICE_CONTEXT,
					data: {
						handle,
						name,
						description,
						categories,
						location,
						owner: user.id,
						status: "active",
						level: 1,
						publishedListingCount: 0,
						previousHandles: [],
					},
				});
				await payload.create({
					collection: "shop-members",
					req,
					overrideAccess: true,
					context: SHOP_SERVICE_CONTEXT,
					data: {
						shop: created.id,
						user: user.id,
						role: "owner",
						status: "active",
					},
				});
				return created;
			},
			{ user },
		);
		return serializePublicShop(shop, account);
	} catch (error) {
		if (isUniqueViolation(error))
			throw new ServiceError(ERROR_CODES.shopHandleTaken, 409);
		throw error;
	}
}

/**
 * Owner only — matching the shop-close rule and the P3 team design, which
 * keeps this endpoint owner-only once managers exist
 * (docs/superpowers/specs/2026-09-15-p3-team-design.md:123). Also gated by
 * the cooldown from the shop's own `handleChangedAt`. The old handle is kept
 * in `previousHandles` for `PREVIOUS_HANDLE_TTL_DAYS` so links people already
 * shared keep resolving; `checkHandleAvailability` refuses a handle still
 * held there by another shop.
 */
export async function changeShopHandle(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	rawHandle: unknown,
	now: Date = new Date(),
): Promise<{ shop: PublicShop; nextHandleChangeAt: string }> {
	const { shop } = await requireShopMember(payload, user, shopId, {
		owner: true,
		writable: true,
	});

	if (nextHandleChangeAt(shop.handleChangedAt, now)) {
		throw new ServiceError(ERROR_CODES.shopHandleCooldown, 409);
	}

	const availability = await checkHandleAvailability(payload, rawHandle, {
		now,
		excludeShopId: String(shop.id),
	});
	if (!availability.available && availability.reason)
		throw handleError(availability.reason);
	const handle = availability.handle;
	if (handle === shop.handle)
		throw new ServiceError(ERROR_CODES.validation, 400);

	const previousHandles = [
		...pruneExpiredHandles(shop.previousHandles ?? [], now)
			.filter((entry) => entry.handle !== handle)
			.map((entry) => ({ handle: entry.handle, until: entry.until })),
		{
			handle: shop.handle,
			until: addDays(now, PREVIOUS_HANDLE_TTL_DAYS).toISOString(),
		},
	];

	try {
		await withTransaction(
			payload,
			async (req) => {
				await releaseClosedHandle(req, handle, now);
				await writeShop(req, String(shop.id), {
					handle,
					handleChangedAt: now.toISOString(),
					previousHandles,
				});
			},
			{ user },
		);
	} catch (error) {
		if (isUniqueViolation(error))
			throw new ServiceError(ERROR_CODES.shopHandleTaken, 409);
		throw error;
	}

	return {
		shop: await loadPublicShop(payload, String(shop.id)),
		nextHandleChangeAt: addDays(now, HANDLE_COOLDOWN_DAYS).toISOString(),
	};
}
