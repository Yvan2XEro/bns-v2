import type { Payload, PayloadRequest } from "payload";
import {
	type ActorLike,
	canActOn,
	isModerator,
	ModerationRuleError,
	resolveSuspensionUntil,
	suspensionSummary,
} from "../access/roles";
import type { ModerationAction } from "../collections/ModerationLog";
import { queueMembershipChange } from "../hooks/membershipEvents";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type { Shop } from "../payload-types";
import {
	notifyShopSuspended,
	notifyShopUnsuspended,
} from "./shopNotifications";

export const SUSPENSION_REASONS = [
	"spam",
	"inappropriate",
	"fraud",
	"prohibited",
	"harassment",
	"other",
] as const;

export type SuspensionReason = (typeof SUSPENSION_REASONS)[number];

function parseSuspensionReason(value: unknown): SuspensionReason {
	if (
		typeof value === "string" &&
		(SUSPENSION_REASONS as readonly string[]).includes(value)
	) {
		return value as SuspensionReason;
	}
	throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
}

export class ModerationError extends ServiceError {
	constructor(code: ErrorCode, status: number, message?: string) {
		super(code, status, message);
		this.name = "ModerationError";
	}
}

export interface Actor extends ActorLike {
	id: string;
}

/** Every write below carries this so the collection hooks know the origin. */
const MODERATION_CONTEXT = { moderationAction: true } as const;

interface LogInput {
	actor: Actor;
	action: ModerationAction;
	targetType: "listing" | "user" | "report" | "shop";
	targetId: string;
	reason?: string | null;
	note?: string | null;
	metadata?: Record<string, unknown>;
}

async function writeLog(
	payload: Payload,
	input: LogInput,
	req?: PayloadRequest,
): Promise<{ id: string }> {
	const created = await payload.create({
		collection: "moderation-log",
		overrideAccess: true,
		context: MODERATION_CONTEXT,
		req,
		data: {
			actor: input.actor.id,
			actorRole: input.actor.role ?? "user",
			action: input.action,
			targetType: input.targetType,
			targetId: input.targetId,
			reason: input.reason ?? undefined,
			note: input.note ?? undefined,
			metadata: input.metadata ?? undefined,
		},
	});
	return { id: String(created.id) };
}

function assertModerator(actor: Actor): void {
	if (!isModerator(actor)) {
		throw new ModerationError(ERROR_CODES.moderationForbidden, 403);
	}
}

function trimmed(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function suspensionUntil(
	actor: Actor,
	durationDays: number | null,
): Date | null {
	try {
		return resolveSuspensionUntil(actor, durationDays);
	} catch (error) {
		if (error instanceof ModerationRuleError) {
			throw new ModerationError(
				ERROR_CODES.moderationDurationInvalid,
				403,
				error.message,
			);
		}
		throw error;
	}
}

/**
 * The most recent log entry for a target/action pair, id included — the
 * source every restore reads to know exactly what its counterpart took down,
 * and (for shops) the identity a later suspension can be told apart from.
 */
async function lastEntry(
	payload: Payload,
	targetType: "user" | "shop",
	targetId: string,
	action: ModerationAction,
	req?: PayloadRequest,
): Promise<{ id: string; metadata: Record<string, unknown> | null } | null> {
	const last = await payload.find({
		collection: "moderation-log",
		depth: 0,
		limit: 1,
		sort: "-createdAt",
		overrideAccess: true,
		req,
		where: {
			and: [
				{ targetType: { equals: targetType } },
				{ targetId: { equals: String(targetId) } },
				{ action: { equals: action } },
			],
		},
	});
	const doc = last.docs[0];
	if (!doc) return null;
	return {
		id: String(doc.id),
		metadata: (doc.metadata as Record<string, unknown> | undefined) ?? null,
	};
}

async function lastEntryMetadata(
	payload: Payload,
	targetType: "user" | "shop",
	targetId: string,
	action: ModerationAction,
	req?: PayloadRequest,
): Promise<Record<string, unknown> | null> {
	return (
		(await lastEntry(payload, targetType, targetId, action, req))?.metadata ??
		null
	);
}

// ─── Listings ────────────────────────────────────────────────────────────────

export interface ListingDecision {
	id: string;
	status: string;
	title: string;
}

export async function approveListing(
	payload: Payload,
	actor: Actor,
	listingId: string,
	note?: string | null,
): Promise<ListingDecision> {
	assertModerator(actor);

	const listing = await findListing(payload, listingId);
	if (listing.status === "published") {
		throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
	}

	return withTransaction(
		payload,
		async (req) => {
			const updated = await payload.update({
				collection: "listings",
				id: listingId,
				req,
				overrideAccess: true,
				context: MODERATION_CONTEXT,
				// Republishing is exactly the decision a hold was recording, so it
				// clears one — a listing approved after `suspendShop` left it
				// deliberately drafted must not still be pinned draft afterwards.
				data: {
					status: "published",
					rejectionReason: null,
					moderationHold: false,
				},
			});

			await writeLog(
				payload,
				{
					actor,
					action: "listing.approve",
					targetType: "listing",
					targetId: listingId,
					note: trimmed(note),
					metadata: { previousStatus: listing.status },
				},
				req,
			);

			return {
				id: String(updated.id),
				status: String(updated.status),
				title: String(updated.title ?? ""),
			};
		},
		{ user: actor },
	);
}

/**
 * A moderator's direct lever to release a hold without also republishing —
 * `approveListing` covers "release and put it back on sale"; this covers
 * "release, and leave the next move to the seller". Both exist so a hold
 * (`moderationHold`, set by `suspendShop`/the user-suspend cascade when
 * `restoreListings` is skipped) is never a one-way door: `Listings.beforeChange`
 * pins `status` right alongside it while a hold is active, on a detached
 * listing as much as an attached one, and only a `MODERATION_CONTEXT` write
 * — never an ordinary one, whatever role holds the session — passes that
 * pin. Without this, the only way past it was `approveListing`, which always
 * forces `published` — wrong for a listing the seller had drafted before the
 * hold, or one they later detached into a plain classified ad they may not
 * want live at all.
 *
 * A listing still attached to a product cannot get away with just clearing
 * the flag, though: once `moderationHold` is false, `syncProductListing`
 * stops pinning `status` to "draft" and republishes it on the seller's very
 * next ordinary action — a stock movement, a product edit — with nothing
 * written to the log. That is the exact defect this mechanism exists to
 * prevent, coming back through the release lever. So for a product-backed
 * listing this also moves `status` to "pending": `listingStatusFor` keeps a
 * pending listing pending for as long as the product stays active, so an
 * ordinary sync can no longer republish it, and only an explicit, logged
 * `approveListing` call can. A detached listing has no sync to leak through,
 * so its status is left exactly as the hold left it — the seller's own next
 * edit decides, same as before.
 */
export async function clearListingHold(
	payload: Payload,
	actor: Actor,
	listingId: string,
	note?: string | null,
): Promise<ListingDecision> {
	assertModerator(actor);

	const listing = await findListing(payload, listingId);
	if (listing.moderationHold !== true) {
		throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
	}
	const isProductBacked = relationId(listing.product) !== null;

	return withTransaction(
		payload,
		async (req) => {
			const updated = await payload.update({
				collection: "listings",
				id: listingId,
				req,
				overrideAccess: true,
				context: MODERATION_CONTEXT,
				data: {
					moderationHold: false,
					...(isProductBacked ? { status: "pending" } : {}),
				},
			});

			await writeLog(
				payload,
				{
					actor,
					action: "listing.holdRelease",
					targetType: "listing",
					targetId: listingId,
					note: trimmed(note),
					metadata: { previousStatus: listing.status },
				},
				req,
			);

			return {
				id: String(updated.id),
				status: String(updated.status),
				title: String(updated.title ?? ""),
			};
		},
		{ user: actor },
	);
}

/**
 * Rejection and takedown are the same mutation on a listing that differs only
 * in where it started, so they are one call and two log actions — the history
 * has to distinguish "never went live" from "was pulled down".
 */
export async function rejectListing(
	payload: Payload,
	actor: Actor,
	listingId: string,
	reason: string,
	note?: string | null,
): Promise<ListingDecision> {
	assertModerator(actor);

	const cleanReason = trimmed(reason);
	if (!cleanReason) {
		throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
	}

	const listing = await findListing(payload, listingId);
	if (listing.status === "rejected") {
		throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
	}

	return withTransaction(
		payload,
		async (req) => {
			const updated = await payload.update({
				collection: "listings",
				id: listingId,
				req,
				overrideAccess: true,
				context: MODERATION_CONTEXT,
				data: { status: "rejected", rejectionReason: cleanReason },
			});

			await writeLog(
				payload,
				{
					actor,
					action:
						listing.status === "published"
							? "listing.takedown"
							: "listing.reject",
					targetType: "listing",
					targetId: listingId,
					reason: cleanReason,
					note: trimmed(note),
					metadata: { previousStatus: listing.status },
				},
				req,
			);

			return {
				id: String(updated.id),
				status: String(updated.status),
				title: String(updated.title ?? ""),
			};
		},
		{ user: actor },
	);
}

async function findListing(payload: Payload, id: string) {
	try {
		return await payload.findByID({
			collection: "listings",
			id,
			depth: 0,
			overrideAccess: true,
		});
	} catch {
		throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
	}
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface SuspensionResult {
	userId: string;
	until: string | null;
	unpublishedListingIds: string[];
}

export async function suspendUser(
	payload: Payload,
	actor: Actor,
	targetId: string,
	input: {
		reason: string;
		durationDays: number | null;
		note?: string | null;
	},
): Promise<SuspensionResult> {
	assertModerator(actor);

	if (String(targetId) === String(actor.id)) {
		throw new ModerationError(ERROR_CODES.moderationRankTooLow, 403);
	}

	const reason = parseSuspensionReason(input.reason);

	const target = await findUser(payload, targetId);
	if (!canActOn(actor, target as ActorLike)) {
		throw new ModerationError(ERROR_CODES.moderationRankTooLow, 403);
	}

	const until = suspensionUntil(actor, input.durationDays);
	const suspension: SuspensionFields = {
		suspendedAt: new Date().toISOString(),
		suspendedUntil: until ? until.toISOString() : null,
		suspendedReason: reason,
		suspendedNote: trimmed(input.note),
		suspendedBy: actor.id,
	};

	return withTransaction(
		payload,
		async (req) => {
			// Listings come down before the account is flagged. If the second write
			// fails, the worst outcome is a few listings hidden without a sanction —
			// recoverable, and visible in the log. The reverse order would leave a
			// suspended seller with live listings and no record of why.
			const unpublished = await payload.find({
				collection: "listings",
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
				req,
				where: {
					and: [
						{ seller: { equals: targetId } },
						{ status: { equals: "published" } },
					],
				},
			});

			const unpublishedListingIds = unpublished.docs.map((doc) =>
				String(doc.id),
			);

			for (const id of unpublishedListingIds) {
				await payload.update({
					collection: "listings",
					id,
					req,
					overrideAccess: true,
					context: MODERATION_CONTEXT,
					data: { status: "draft", moderationHold: true },
				});
			}

			await payload.update({
				collection: "users",
				id: targetId,
				req,
				overrideAccess: true,
				context: MODERATION_CONTEXT,
				data: suspension,
			});

			// P3: `resolveShopRole` returns null for a suspended non-owner, so
			// every shop they belong to has a stale chat-service cache. The
			// membership row and their conversation assignments are untouched —
			// the owner can see and reassign deliberately, and lifting the
			// suspension restores access with no write at all.
			const memberships = await payload.find({
				collection: "shop-members",
				where: {
					and: [
						{ user: { equals: targetId } },
						{ status: { equals: "active" } },
					],
				},
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
				req,
			});
			for (const row of memberships.docs) {
				const memberShopId = relationId(row.shop);
				if (memberShopId) {
					await queueMembershipChange(commitContextOf(req), memberShopId, [
						targetId,
					]);
				}
			}

			// The user's own listings (shop listings included, `seller` is the
			// user) are already drafted above, so the shop cascade below never
			// touches listings — only the shop's own status.
			const ownedShops = await payload.find({
				collection: "shops",
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
				req,
				where: {
					and: [
						{ owner: { equals: targetId } },
						{ status: { equals: "active" } },
					],
				},
			});
			const suspendedShopIds: string[] = [];
			// Each cascaded shop gets its own `shop.suspend` entry — the shop's own
			// history should say why it went down, and its id is what
			// `unsuspendUser` later matches against to tell "still on this cascade's
			// suspension" from "independently re-suspended since".
			const shopSuspensionLogIds: Record<string, string> = {};
			for (const doc of ownedShops.docs) {
				const shopId = String(doc.id);
				const shopLog = await writeLog(
					payload,
					{
						actor,
						action: "shop.suspend",
						targetType: "shop",
						targetId: shopId,
						reason,
						note: suspension.suspendedNote,
						metadata: {
							until: suspension.suspendedUntil,
							durationDays: input.durationDays ?? null,
							unpublishedListingIds: [],
							cascadedFromUser: targetId,
							suspendedAt: suspension.suspendedAt,
						},
					},
					req,
				);
				await applyShopSuspension(payload, req, shopId, suspension, shopLog.id);
				suspendedShopIds.push(shopId);
				shopSuspensionLogIds[shopId] = shopLog.id;
			}

			await writeLog(
				payload,
				{
					actor,
					action: "user.suspend",
					targetType: "user",
					targetId,
					reason,
					note: suspension.suspendedNote,
					metadata: {
						until: suspension.suspendedUntil,
						durationDays: input.durationDays ?? null,
						unpublishedListingIds,
						suspendedShopIds,
						shopSuspensionLogIds,
					},
				},
				req,
			);

			return {
				userId: String(targetId),
				until: suspension.suspendedUntil,
				unpublishedListingIds,
			};
		},
		{ user: actor },
	);
}

export async function unsuspendUser(
	payload: Payload,
	actor: Actor,
	targetId: string,
	input: { note?: string | null; restoreListings?: boolean } = {},
): Promise<{
	userId: string;
	restoredListingIds: string[];
	restoredShopIds: string[];
}> {
	assertModerator(actor);

	const target = await findUser(payload, targetId);
	if (!canActOn(actor, target as ActorLike)) {
		throw new ModerationError(ERROR_CODES.moderationRankTooLow, 403);
	}

	const summary = suspensionSummary(target as never);
	if (!summary.active && !summary.expired) {
		throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
	}

	return withTransaction(
		payload,
		async (req) => {
			const restore = input.restoreListings !== false;
			const restoredListingIds = restore
				? await restoreSuspendedListings(payload, targetId, req)
				: [];

			// Read before the new `user.unsuspend` entry below is written, which
			// would otherwise become the "most recent" one for this target/action.
			const metadata = await lastEntryMetadata(
				payload,
				"user",
				targetId,
				"user.suspend",
				req,
			);
			// Guarded by the shop's own `shop.suspend` log entry id, not just
			// `status === "suspended"`: a shop this cascade suspended may since
			// have been unsuspended and independently re-suspended by a fresh
			// moderation action (its own entry, its own id), which must not be
			// undone by lifting the user's own suspension.
			const shopSuspensionLogIds =
				(metadata?.shopSuspensionLogIds as
					| Record<string, unknown>
					| undefined) ?? {};
			const restoredShopIds: string[] = [];
			for (const shopId of Array.isArray(metadata?.suspendedShopIds)
				? metadata.suspendedShopIds.map(String)
				: []) {
				const shop = await payload
					.findByID({
						collection: "shops",
						id: shopId,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null);
				if (shop?.status !== "suspended") continue;
				const expectedId = shopSuspensionLogIds[shopId];
				const matches = sameSuspension(
					payload,
					shopId,
					{
						id: expectedId ? String(expectedId) : null,
						suspendedAt: target.suspendedAt,
					},
					{
						id: shop.suspensionLogId ? String(shop.suspensionLogId) : null,
						suspendedAt: shop.suspendedAt,
					},
				);
				if (!matches) continue;
				await clearShopSuspension(payload, req, shopId);
				restoredShopIds.push(shopId);
			}

			await payload.update({
				collection: "users",
				id: targetId,
				req,
				overrideAccess: true,
				context: MODERATION_CONTEXT,
				data: {
					suspendedAt: null,
					suspendedUntil: null,
					suspendedReason: null,
					suspendedNote: null,
					suspendedBy: null,
				},
			});

			// Same shops as the suspension published to; `removedUserIds` still
			// names the user even though access is being restored — chat-service's
			// subscriber drops the cached set either way, and naming them makes
			// the eviction explicit.
			const memberships = await payload.find({
				collection: "shop-members",
				where: {
					and: [
						{ user: { equals: targetId } },
						{ status: { equals: "active" } },
					],
				},
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
				req,
			});
			for (const row of memberships.docs) {
				const memberShopId = relationId(row.shop);
				if (memberShopId) {
					await queueMembershipChange(commitContextOf(req), memberShopId, [
						targetId,
					]);
				}
			}

			await writeLog(
				payload,
				{
					actor,
					action: "user.unsuspend",
					targetType: "user",
					targetId,
					note: trimmed(input.note),
					metadata: {
						restoredListingIds,
						wasExpired: summary.expired,
						restoredShopIds,
					},
				},
				req,
			);

			return { userId: String(targetId), restoredListingIds, restoredShopIds };
		},
		{ user: actor },
	);
}

/**
 * Restores only what the most recent suspension actually took down, and only
 * if it is still sitting in draft — a listing the seller has since sold or
 * deleted must not be dragged back online.
 */
async function restoreSuspendedListings(
	payload: Payload,
	targetId: string,
	req?: PayloadRequest,
): Promise<string[]> {
	const metadata = await lastEntryMetadata(
		payload,
		"user",
		targetId,
		"user.suspend",
		req,
	);
	const ids = Array.isArray(metadata?.unpublishedListingIds)
		? metadata.unpublishedListingIds.map(String)
		: [];

	const restored: string[] = [];
	for (const id of ids) {
		try {
			const listing = await payload.findByID({
				collection: "listings",
				id,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (listing.status !== "draft") continue;

			await payload.update({
				collection: "listings",
				id,
				req,
				overrideAccess: true,
				context: MODERATION_CONTEXT,
				data: { status: "published", moderationHold: false },
			});
			restored.push(id);
		} catch {
			// Deleted in the meantime; nothing to restore.
		}
	}

	return restored;
}

async function findUser(payload: Payload, id: string) {
	try {
		return await payload.findByID({
			collection: "users",
			id,
			depth: 0,
			overrideAccess: true,
		});
	} catch {
		throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
	}
}

// ─── Shops ───────────────────────────────────────────────────────────────────

/** Shops' own beforeChange lets both flags through; `shopService` also covers P2's field list. */
const SHOP_MODERATION_CONTEXT = {
	moderationAction: true,
	shopService: true,
} as const;

interface SuspensionFields {
	suspendedAt: string;
	suspendedUntil: string | null;
	suspendedReason: SuspensionReason;
	suspendedNote: string | null;
	suspendedBy: string;
}

async function findShopForModeration(payload: Payload, id: string) {
	try {
		return await payload.findByID({
			collection: "shops",
			id,
			depth: 0,
			overrideAccess: true,
		});
	} catch {
		throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
	}
}

async function applyShopSuspension(
	payload: Payload,
	req: PayloadRequest,
	shopId: string,
	suspension: SuspensionFields,
	suspensionLogId: string,
) {
	await payload.update({
		collection: "shops",
		id: shopId,
		req,
		overrideAccess: true,
		context: SHOP_MODERATION_CONTEXT,
		data: { status: "suspended", ...suspension, suspensionLogId },
	});
}

async function clearShopSuspension(
	payload: Payload,
	req: PayloadRequest,
	shopId: string,
) {
	await payload.update({
		collection: "shops",
		id: shopId,
		req,
		overrideAccess: true,
		context: SHOP_MODERATION_CONTEXT,
		data: {
			status: "active",
			suspendedAt: null,
			suspendedUntil: null,
			suspendedReason: null,
			suspendedNote: null,
			suspendedBy: null,
			suspensionLogId: null,
		},
	});
}

/**
 * True if `current` is still under the exact suspension `expected` describes.
 * Every suspension written through this service sets `suspensionLogId`, the
 * id of the `shop.suspend` entry that produced it, so that is the primary
 * match. `shops` ships in this same release, so no row can predate the
 * field and no backfill is owed — but nothing here should ever be trusted to
 * guarantee a non-null id either, so a missing one is never a silent
 * mismatch: it is logged loudly and the match falls back to `suspendedAt`,
 * the identity this guard used before `suspensionLogId` existed, so an
 * unexpected null still lets a genuinely-expired or genuinely-restorable
 * shop through instead of freezing it suspended forever.
 */
function sameSuspension(
	payload: Payload,
	shopId: string,
	expected: { id: string | null; suspendedAt: unknown },
	current: { id: string | null; suspendedAt: unknown },
): boolean {
	if (expected.id && current.id) return expected.id === current.id;
	payload.logger.error(
		{
			shopId,
			expectedSuspensionLogId: expected.id,
			currentSuspensionLogId: current.id,
		},
		"[moderation] shop suspension is missing its suspensionLogId; falling back to suspendedAt to match it",
	);
	return (
		Date.parse(String(current.suspendedAt)) ===
		Date.parse(String(expected.suspendedAt))
	);
}

/**
 * Only the listings the current suspension took down, matched on its start
 * date so an older entry can never drive a restore, and only while they are
 * still drafts in this shop.
 */
async function restoreShopListings(
	payload: Payload,
	req: PayloadRequest,
	shop: Shop,
): Promise<string[]> {
	const entry = await lastEntry(
		payload,
		"shop",
		String(shop.id),
		"shop.suspend",
		req,
	);
	if (!entry) return [];
	const matches = sameSuspension(
		payload,
		String(shop.id),
		{ id: entry.id, suspendedAt: entry.metadata?.suspendedAt },
		{
			id: shop.suspensionLogId ? String(shop.suspensionLogId) : null,
			suspendedAt: shop.suspendedAt,
		},
	);
	if (!matches) return [];
	const metadata = entry.metadata;

	const restored: string[] = [];
	for (const id of Array.isArray(metadata?.unpublishedListingIds)
		? metadata.unpublishedListingIds.map(String)
		: []) {
		const listing = await payload
			.findByID({
				collection: "listings",
				id,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		if (
			!listing ||
			listing.status !== "draft" ||
			relationId(listing.shop) !== String(shop.id)
		) {
			continue;
		}
		await payload.update({
			collection: "listings",
			id,
			req,
			overrideAccess: true,
			context: MODERATION_CONTEXT,
			data: { status: "published", moderationHold: false },
		});
		restored.push(id);
	}
	return restored;
}

async function assertCanActOnShop(payload: Payload, actor: Actor, shop: Shop) {
	const owner = await findUser(payload, relationId(shop.owner) ?? "");
	if (
		String(owner.id) === String(actor.id) ||
		!canActOn(actor, owner as ActorLike)
	) {
		throw new ModerationError(ERROR_CODES.moderationRankTooLow, 403);
	}
}

export async function suspendShop(
	payload: Payload,
	actor: Actor,
	shopId: string,
	input: { reason: string; durationDays: number | null; note?: string | null },
): Promise<{
	shopId: string;
	until: string | null;
	unpublishedListingIds: string[];
}> {
	assertModerator(actor);
	const reason = parseSuspensionReason(input.reason);
	const shop = await findShopForModeration(payload, shopId);
	await assertCanActOnShop(payload, actor, shop);
	if (shop.status !== "active") {
		throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
	}

	const until = suspensionUntil(actor, input.durationDays);
	const suspension: SuspensionFields = {
		suspendedAt: new Date().toISOString(),
		suspendedUntil: until ? until.toISOString() : null,
		suspendedReason: reason,
		suspendedNote: trimmed(input.note),
		suspendedBy: actor.id,
	};

	return withTransaction(
		payload,
		async (req) => {
			// Re-checked here, not just before the transaction opened: the read
			// above and this one can straddle another suspend that lands in
			// between, and without this re-check both would proceed, the second
			// overwriting the first's suspension fields and orphaning its restore
			// set (its own `unpublishedListingIds` would never be looked at again).
			const current = await payload
				.findByID({
					collection: "shops",
					id: shopId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			if (!current || current.status !== "active") {
				throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
			}

			const published = await payload.find({
				collection: "listings",
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
				req,
				where: {
					and: [
						{ shop: { equals: shopId } },
						{ status: { equals: "published" } },
					],
				},
			});
			const unpublishedListingIds = published.docs.map((doc) => String(doc.id));
			for (const id of unpublishedListingIds) {
				await payload.update({
					collection: "listings",
					id,
					req,
					overrideAccess: true,
					context: MODERATION_CONTEXT,
					data: { status: "draft", moderationHold: true },
				});
			}

			const logEntry = await writeLog(
				payload,
				{
					actor,
					action: "shop.suspend",
					targetType: "shop",
					targetId: shopId,
					reason,
					note: suspension.suspendedNote,
					metadata: {
						until: suspension.suspendedUntil,
						durationDays: input.durationDays ?? null,
						unpublishedListingIds,
						suspendedAt: suspension.suspendedAt,
					},
				},
				req,
			);
			await applyShopSuspension(payload, req, shopId, suspension, logEntry.id);
			// No removed ids: the memberships still exist, `resolveShopRole`
			// returns null for every non-owner of a suspended shop, so the
			// subscriber refetches and evicts whoever is no longer in the set.
			await queueMembershipChange(commitContextOf(req), shopId);
			onCommit(commitContextOf(req), () =>
				notifyShopSuspended(shop, suspension.suspendedUntil, reason),
			);
			return {
				shopId: String(shopId),
				until: suspension.suspendedUntil,
				unpublishedListingIds,
			};
		},
		{ user: actor },
	);
}

export async function unsuspendShop(
	payload: Payload,
	actor: Actor,
	shopId: string,
	input: { note?: string | null; restoreListings?: boolean } = {},
): Promise<{ shopId: string; restoredListingIds: string[] }> {
	assertModerator(actor);
	const shop = await findShopForModeration(payload, shopId);
	await assertCanActOnShop(payload, actor, shop);
	if (shop.status !== "suspended") {
		throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
	}

	return withTransaction(
		payload,
		async (req) => {
			const restoredListingIds =
				input.restoreListings === false
					? []
					: await restoreShopListings(payload, req, shop);
			await clearShopSuspension(payload, req, shopId);
			await queueMembershipChange(commitContextOf(req), shopId);
			await writeLog(
				payload,
				{
					actor,
					action: "shop.unsuspend",
					targetType: "shop",
					targetId: shopId,
					note: trimmed(input.note),
					metadata: { restoredListingIds },
				},
				req,
			);
			onCommit(commitContextOf(req), () => notifyShopUnsuspended(shop));
			return { shopId: String(shopId), restoredListingIds };
		},
		{ user: actor },
	);
}

/**
 * Users need no job because their suspension is derived from dates at read
 * time; a shop's `status` is stored, so a lapsed suspension is lifted here.
 * The log entry is attributed to the moderator who set the end date, marked
 * `actorRole: "system"` so history can tell an automatic lift from a manual
 * one.
 *
 * The candidate list below is read once, outside any transaction, purely to
 * find shops worth looking at. Nothing from it is trusted afterwards: a
 * moderator can unsuspend (or unsuspend and independently re-suspend) a shop
 * in the window between that read and a given shop's own transaction, and two
 * overlapping runs of this job race the same window against each other. Each
 * shop is re-read inside its own transaction and only acted on if it is still
 * suspended under the exact suspension the candidate list saw, identified by
 * `suspensionLogId` rather than by timestamp.
 */
export async function liftExpiredShopSuspensions(
	payload: Payload,
	now: Date = new Date(),
): Promise<{ lifted: string[] }> {
	const due = await payload.find({
		collection: "shops",
		depth: 0,
		limit: 100,
		overrideAccess: true,
		where: {
			and: [
				{ status: { equals: "suspended" } },
				{ suspendedUntil: { less_than_equal: now.toISOString() } },
			],
		},
	});

	const lifted: string[] = [];
	for (const candidate of due.docs) {
		const shopId = String(candidate.id);
		const expected = {
			id: candidate.suspensionLogId ? String(candidate.suspensionLogId) : null,
			suspendedAt: candidate.suspendedAt,
		};

		const acted = await withTransaction(payload, async (req) => {
			const shop = await payload
				.findByID({
					collection: "shops",
					id: shopId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			if (!shop || shop.status !== "suspended") return false;
			// Not the suspension the candidate list saw: either lifted and
			// re-suspended since, or (with a real transactional adapter) already
			// lifted by an overlapping run of this same job.
			const current = {
				id: shop.suspensionLogId ? String(shop.suspensionLogId) : null,
				suspendedAt: shop.suspendedAt,
			};
			if (!sameSuspension(payload, shopId, expected, current)) return false;

			const by = relationId(shop.suspendedBy);
			if (!by) {
				// The log's `actor` is a required relationship to a real user;
				// there is no system account to attribute this to instead. Rather
				// than clear the suspension and break the "every action is
				// logged" rule, leave it in place — this shop needs a human to
				// look at how it lost its `suspendedBy` in the first place.
				payload.logger.error(
					{ shopId },
					"[moderation] suspended shop has no suspendedBy; the expiry job will not lift it",
				);
				return false;
			}

			const restoredListingIds = await restoreShopListings(payload, req, shop);
			await clearShopSuspension(payload, req, shopId);
			await writeLog(
				payload,
				{
					actor: { id: by, role: "system" },
					action: "shop.unsuspend",
					targetType: "shop",
					targetId: shopId,
					note: "Suspension expired",
					metadata: { expired: true, restoredListingIds },
				},
				req,
			);
			onCommit(commitContextOf(req), () => notifyShopUnsuspended(shop));
			return true;
		});

		if (acted) lifted.push(shopId);
	}
	return { lifted };
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function decideReport(
	payload: Payload,
	actor: Actor,
	reportId: string,
	input: { outcome: "resolved" | "dismissed"; resolution?: string | null },
): Promise<{ id: string; status: string }> {
	assertModerator(actor);

	const report = await findReport(payload, reportId);

	if (report.status !== "pending") {
		throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
	}

	const resolution =
		trimmed(input.resolution) ??
		(input.outcome === "dismissed" ? "Dismissed" : null);
	if (!resolution) {
		throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
	}

	const status = input.outcome === "dismissed" ? "reviewed" : "resolved";

	const updated = await payload.update({
		collection: "reports",
		id: reportId,
		overrideAccess: true,
		context: MODERATION_CONTEXT,
		data: { status, resolution, resolvedBy: actor.id },
	});

	await writeLog(payload, {
		actor,
		action: input.outcome === "dismissed" ? "report.dismiss" : "report.resolve",
		targetType: "report",
		targetId: reportId,
		reason: resolution,
		metadata: {
			reportedTargetType: report.targetType,
			reportedTargetId: report.targetId,
		},
	});

	return { id: String(updated.id), status: String(updated.status) };
}

async function findReport(payload: Payload, id: string) {
	try {
		return await payload.findByID({
			collection: "reports",
			id,
			depth: 0,
			overrideAccess: true,
		});
	} catch {
		throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
	}
}
