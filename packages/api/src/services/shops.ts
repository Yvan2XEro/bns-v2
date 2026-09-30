import type { Payload, PayloadRequest } from "payload";
import { isSuspended, suspensionSummary } from "../access/roles";
import type { ShopRole } from "../access/shopRoles";
import { NOT_ARCHIVED } from "../collections/ProductVariants";
import { SHOP_SERVICE_CONTEXT } from "../collections/Shops";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import { type PublicShop, serializePublicShop } from "../lib/publicShop";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	type ShopCapabilities,
	shopCapabilities,
} from "../lib/shopCapabilities";
import {
	addDays,
	closedHandleReleased,
	HANDLE_COOLDOWN_DAYS,
	isPreviousHandleActive,
	nextHandleChangeAt,
	normalizeHandle,
	PREVIOUS_HANDLE_TTL_DAYS,
	pruneExpiredHandles,
	releasedHandleFor,
	validateHandle,
} from "../lib/shopHandle";
import { getShopSettings } from "../lib/shopSettings";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import { isLowStock } from "../lib/variants";
import type { Product, Shop } from "../payload-types";
import { loadPublicShop, requireShopMember } from "./shopGuards";
import { notifyShopCreated } from "./shopNotifications";

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

export type LevelCause =
	| "approved"
	| "rejected"
	| "revoked"
	| "expired"
	| "superseded"
	| "owner_changed"
	| "shop_closed"
	| "manual";

export interface ShopLevelChange {
	shopId: string;
	previousLevel: number;
	level: number;
	cause: LevelCause;
}

export type ShopLevelListener = (
	req: PayloadRequest,
	event: ShopLevelChange,
) => Promise<void> | void;

const shopLevelListeners: ShopLevelListener[] = [];

/**
 * P3 registers the team pause here, P4 and P5 their own reactions. Listeners
 * run inside the transition's transaction, so a listener that writes is part
 * of the same atomic change.
 */
export function onShopLevelChanged(listener: ShopLevelListener): () => void {
	shopLevelListeners.push(listener);
	return () => {
		const index = shopLevelListeners.indexOf(listener);
		if (index >= 0) shopLevelListeners.splice(index, 1);
	};
}

/** Test-only: listeners are module state, and a suite that registers one must be able to undo it. */
export function __resetShopLevelListeners(): void {
	shopLevelListeners.length = 0;
}

export async function notifyShopLevelChanged(
	req: PayloadRequest,
	event: ShopLevelChange,
): Promise<void> {
	for (const listener of [...shopLevelListeners]) {
		try {
			await listener(req, event);
		} catch (error) {
			// A later phase's reaction must not roll back a verification decision
			// that is otherwise correct; the decision is the record, the reaction
			// is a consequence.
			req.payload.logger.error(
				{ err: error, event },
				"[shops] level listener failed",
			);
		}
	}
}

/**
 * The only writer of `shops.level`, `levelExpiresAt` and `verifiedAt`. Goes
 * through `writeShop`, so the Shops `afterChange` hook still queues the search
 * event that re-indexes the shop's listings on a level change — a direct
 * `payload.update` here would silently stop that happening.
 */
export async function setShopLevel(
	req: PayloadRequest,
	shopId: string,
	input: {
		level: 1 | 2 | 3;
		levelExpiresAt: string | null;
		verifiedAt?: string | null;
	},
): Promise<Shop> {
	const data: Record<string, unknown> = {
		level: input.level,
		levelExpiresAt: input.levelExpiresAt,
	};
	// Once set, it stays: it records when this shop first proved an identity,
	// not whether it currently has one.
	if (input.verifiedAt) data.verifiedAt = input.verifiedAt;
	return writeShop(req, shopId, data);
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
				onCommit(commitContextOf(req), () => notifyShopCreated(created));
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

export interface MyShopResponse {
	shop:
		| (PublicShop & {
				capabilities: ShopCapabilities;
				status: string;
				handleChangedAt: string | null;
				nextHandleChangeAt: string | null;
				suspension: {
					active: boolean;
					indefinite: boolean;
					until: string | null;
					reason: string | null;
				} | null;
		  })
		| null;
	role: ShopRole | null;
	counts: {
		activeProducts: number;
		draftProducts: number;
		lowStockVariants: number;
		lowStockSample: string | null;
		personalListings: number;
	} | null;
}

/**
 * The owner keeps seeing a suspended shop, with its reason, so the management
 * screens can explain what happened. A closed shop is gone for the owner too.
 */
export async function getMyShop(
	payload: Payload,
	user: ServiceUser,
	now: Date = new Date(),
): Promise<MyShopResponse> {
	const memberships = await payload.find({
		collection: "shop-members",
		where: {
			and: [{ user: { equals: user.id } }, { status: { equals: "active" } }],
		},
		depth: 0,
		limit: 10,
		overrideAccess: true,
	});

	let shop: Shop | null = null;
	let role: ShopRole | null = null;
	for (const membership of memberships.docs) {
		const candidate = await payload
			.findByID({
				collection: "shops",
				id: relationId(membership.shop) ?? "",
				depth: 0,
				overrideAccess: true,
			})
			.catch(() => null);
		if (candidate && candidate.status !== "closed") {
			shop = candidate;
			role = membership.role as ShopRole;
			break;
		}
	}
	if (!shop) return { shop: null, role: null, counts: null };

	const shopId = String(shop.id);
	const [publicShop, active, drafts, variants, personal] = await Promise.all([
		loadPublicShop(payload, shopId),
		payload.count({
			collection: "products",
			where: {
				and: [{ shop: { equals: shopId } }, { status: { equals: "active" } }],
			},
			overrideAccess: true,
		}),
		payload.count({
			collection: "products",
			where: {
				and: [{ shop: { equals: shopId } }, { status: { equals: "draft" } }],
			},
			overrideAccess: true,
		}),
		payload.find({
			collection: "product-variants",
			where: { and: [{ shop: { equals: shopId } }, NOT_ARCHIVED] },
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
		}),
		payload.count({
			collection: "listings",
			where: {
				and: [
					{ seller: { equals: user.id } },
					{ shop: { exists: false } },
					{ status: { in: ["draft", "pending", "published"] } },
				],
			},
			overrideAccess: true,
		}),
	]);

	const low = variants.docs.filter(isLowStock);
	const sampleProduct: Product | null = low[0]
		? await payload
				.findByID({
					collection: "products",
					id: relationId(low[0].product) ?? "",
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null)
		: null;
	const summary = suspensionSummary(shop);

	return {
		shop: {
			...publicShop,
			capabilities: shopCapabilities(shop, now),
			status: String(shop.status),
			handleChangedAt: shop.handleChangedAt ?? null,
			nextHandleChangeAt:
				nextHandleChangeAt(shop.handleChangedAt, now)?.toISOString() ?? null,
			suspension:
				shop.status === "suspended"
					? {
							active: summary.active,
							indefinite: summary.indefinite,
							until: summary.until,
							reason: shop.suspendedReason ?? null,
						}
					: null,
		},
		role,
		counts: {
			activeProducts: active.totalDocs,
			draftProducts: drafts.totalDocs,
			lowStockVariants: low.length,
			lowStockSample: sampleProduct ? String(sampleProduct.title) : null,
			personalListings: personal.totalDocs,
		},
	};
}

/**
 * Suspended and closed shops are 404 to the public; an old handle answers
 * with its successor. `options.manage` is the owner-facing variant: it keeps
 * a suspended shop visible (so the owner can see why) and attaches
 * `capabilities`, which the public variant never exposes — a visitor reads
 * only `level` and `badge` off the public shape.
 */
export async function resolvePublicShop(
	payload: Payload,
	rawHandle: unknown,
	now: Date = new Date(),
	options: { manage?: boolean } = {},
): Promise<
	| { shop: PublicShop & { capabilities?: ShopCapabilities } }
	| { redirectTo: string }
	| null
> {
	const handle = normalizeHandle(rawHandle);
	if (!handle) return null;

	const current = await payload.find({
		collection: "shops",
		where: { handle: { equals: handle } },
		depth: 0,
		limit: 1,
		overrideAccess: true,
	});
	const shop = current.docs[0] as Shop | undefined;
	if (shop) {
		if (!options.manage && shop.status !== "active") return null;
		if (options.manage && shop.status === "closed") return null;
		const publicShop = await loadPublicShop(payload, String(shop.id));
		return {
			shop: options.manage
				? { ...publicShop, capabilities: shopCapabilities(shop, now) }
				: publicShop,
		};
	}

	const previous = await payload.find({
		collection: "shops",
		where: {
			and: [
				{ "previousHandles.handle": { equals: handle } },
				{ status: { equals: "active" } },
			],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	const successor = (previous.docs as Shop[]).find((doc) =>
		(doc.previousHandles ?? []).some(
			(entry) => entry.handle === handle && isPreviousHandleActive(entry, now),
		),
	);
	return successor ? { redirectTo: String(successor.handle) } : null;
}
