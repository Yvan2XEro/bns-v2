import type { Payload, PayloadRequest } from "payload";
import {
	type ActorLike,
	canActOn,
	isAdmin,
	isModerator,
	ModerationRuleError,
	resolveSuspensionUntil,
	suspensionSummary,
} from "../access/roles";
import type { ModerationAction } from "../collections/ModerationLog";
import { ORDER_SERVICE_CONTEXT } from "../collections/Orders";
import {
	PAYOUT_HOLD_REASONS,
	type PayoutHoldReason,
} from "../collections/PayoutHolds";
import { queueMembershipChange } from "../hooks/membershipEvents";
import { queueSystemMessage } from "../hooks/systemMessageEvents";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type {
	ConnectedAccount,
	Order,
	OrderItem,
	Payout,
	PayoutAccount,
	PayoutHold,
	ResaleLink,
	ResellerCommission,
	RiskFlag,
	Shop,
} from "../payload-types";
import type { RiskFlagDecisionInput } from "../types/riskModeration";
import { findConnectedAccount } from "./connectedAccounts";
import { openProtectedExposure } from "./exposure";
import { applyTransition, TERMINAL_STATUSES } from "./orders/transitions";
import {
	notifyPayoutHoldPlaced,
	notifyPayoutHoldReleased,
} from "./paymentNotifications";
import { activateReviewedPayoutAccount } from "./payoutAccounts";
import {
	activeHolds,
	createHold,
	findActiveHold,
	holdReasonCategory,
	type PayoutHoldCategory,
	releaseHold,
	type ShopRefundRate,
	shopRefundRate,
} from "./payoutHolds";
import { updateResaleListingHold } from "./resale";
import {
	notifyResaleLinkDecided,
	notifyResaleLinkSuspended,
} from "./resaleNotifications";
import { riskFlagRetentionDate } from "./riskRetention";
import {
	notifyShopSuspended,
	notifyShopUnsuspended,
} from "./shopNotifications";
import { release } from "./stock";

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

export interface ModerationLogInput {
	actor: Actor;
	action: ModerationAction;
	targetType:
		| "listing"
		| "user"
		| "report"
		| "shop"
		| "order"
		| "dispute"
		| "resale-link"
		| "risk-flag";
	targetId: string;
	reason?: string | null;
	note?: string | null;
	metadata?: Record<string, unknown>;
}

export async function writeLog(
	payload: Payload,
	input: ModerationLogInput,
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

export function assertModerator(actor: Actor): void {
	if (!isModerator(actor)) {
		throw new ModerationError(ERROR_CODES.moderationForbidden, 403);
	}
}

function trimmed(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPayoutHoldReason(reason: string): reason is PayoutHoldReason {
	return PAYOUT_HOLD_REASONS.some((candidate) => candidate === reason);
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
	targetType: "user" | "shop" | "resale-link",
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
	targetType: "user" | "shop" | "resale-link",
	targetId: string,
	action: ModerationAction,
	req?: PayloadRequest,
): Promise<Record<string, unknown> | null> {
	return (
		(await lastEntry(payload, targetType, targetId, action, req))?.metadata ??
		null
	);
}

const RESALE_LINK_SUSPENSION_REASONS = [
	"quality",
	"pricing",
	"fraud_review",
	"terms",
	"other",
] as const;

type ResaleLinkSuspensionReason =
	(typeof RESALE_LINK_SUSPENSION_REASONS)[number];

function resaleLinkSuspensionReason(
	value: unknown,
): ResaleLinkSuspensionReason {
	if (
		typeof value === "string" &&
		RESALE_LINK_SUSPENSION_REASONS.includes(value as ResaleLinkSuspensionReason)
	) {
		return value as ResaleLinkSuspensionReason;
	}
	throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return Object.fromEntries(Object.entries(value));
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

async function findResaleLinkForModeration(
	payload: Payload,
	linkId: string,
	req?: PayloadRequest,
): Promise<ResaleLink> {
	const link = await payload
		.findByID({
			collection: "resale-links",
			id: linkId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	if (!link) {
		throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
	}
	return link;
}

async function assertCanModerateResaleLink(
	payload: Payload,
	actor: Actor,
	link: ResaleLink,
	req?: PayloadRequest,
): Promise<{ supplierShopId: string; resellerShopId: string }> {
	const supplierShopId = relationId(link.supplierShop);
	const resellerShopId = relationId(link.resellerShop);
	if (!supplierShopId || !resellerShopId) {
		throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
	}
	const [supplierShop, resellerShop] = await Promise.all([
		findShopForModeration(payload, supplierShopId, req),
		findShopForModeration(payload, resellerShopId, req),
	]);
	await Promise.all([
		assertNotShopMember(payload, actor, supplierShop, req),
		assertNotShopMember(payload, actor, resellerShop, req),
	]);
	const supplierOwnerId = relationId(supplierShop.owner);
	const supplierOwner = supplierOwnerId
		? await payload
				.findByID({
					collection: "users",
					id: supplierOwnerId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null)
		: null;
	if (!supplierOwner || !canActOn(actor, supplierOwner)) {
		throw new ModerationError(ERROR_CODES.moderationRankTooLow, 403);
	}
	return { supplierShopId, resellerShopId };
}

interface ResaleCommissionSnapshot {
	id: string;
	previousStatus: "accrued" | "payable";
	previousHoldReasons: string[];
}

type ResellerCommissionHoldReason = NonNullable<
	ResellerCommission["holdReasons"]
>[number];

function commissionSnapshots(metadata: Record<string, unknown> | null) {
	const values = objectRecord(metadata)?.commissions;
	if (!Array.isArray(values)) return [] as ResaleCommissionSnapshot[];
	const snapshots: ResaleCommissionSnapshot[] = [];
	for (const value of values) {
		const row = objectRecord(value);
		if (
			!row ||
			typeof row.id !== "string" ||
			(row.previousStatus !== "accrued" && row.previousStatus !== "payable")
		)
			continue;
		snapshots.push({
			id: row.id,
			previousStatus: row.previousStatus,
			previousHoldReasons: stringArray(row.previousHoldReasons),
		});
	}
	return snapshots;
}

export async function suspendResaleLink(
	payload: Payload,
	actor: Actor,
	linkId: string,
	input: { reason: string; note?: string | null },
	options: { req?: PayloadRequest } = {},
): Promise<ResaleLink> {
	assertModerator(actor);
	const reason = resaleLinkSuspensionReason(input.reason);
	const note = trimmed(input.note);
	const initialLink = await findResaleLinkForModeration(payload, linkId);
	const { supplierShopId, resellerShopId } = await assertCanModerateResaleLink(
		payload,
		actor,
		initialLink,
	);

	const applySuspension = async (req: PayloadRequest) => {
		const link = await findResaleLinkForModeration(payload, linkId, req);
		const currentParties = await assertCanModerateResaleLink(
			payload,
			actor,
			link,
			req,
		);
		if (
			currentParties.supplierShopId !== supplierShopId ||
			currentParties.resellerShopId !== resellerShopId
		) {
			throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
		}
		if (link.status !== "approved") {
			throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
		}
		const resaleListings = await payload.find({
			collection: "listings",
			where: {
				and: [
					{ shop: { equals: resellerShopId } },
					{ "resale.supplierShop": { equals: supplierShopId } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const orders = await payload.find({
			collection: "purchase-orders",
			where: { link: { equals: linkId } },
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const orderIds = orders.docs.map((order) => String(order.id));
		const commissions = orderIds.length
			? await payload.find({
					collection: "reseller-commissions",
					where: {
						and: [
							{ purchaseOrder: { in: orderIds } },
							{ status: { in: ["accrued", "payable"] } },
						],
					},
					limit: 0,
					pagination: false,
					depth: 0,
					overrideAccess: true,
					req,
				})
			: { docs: [] };
		const snapshots: ResaleCommissionSnapshot[] = [];
		for (const commission of commissions.docs) {
			const previousStatus = commission.status;
			if (previousStatus !== "accrued" && previousStatus !== "payable") {
				continue;
			}
			const previousHoldReasons = commission.holdReasons ?? [];
			snapshots.push({
				id: String(commission.id),
				previousStatus,
				previousHoldReasons,
			});
			await payload.update({
				collection: "reseller-commissions",
				id: commission.id,
				data: {
					status: "held",
					holdReasons: [
						...new Set([...previousHoldReasons, "moderation" as const]),
					],
				},
				depth: 0,
				overrideAccess: true,
				req,
			});
		}

		const updated = await payload.update({
			collection: "resale-links",
			id: linkId,
			data: {
				status: "suspended",
				suspendedBy: "moderator",
				suspendedReason: reason,
				decidedBy: actor.id,
				decidedAt: new Date().toISOString(),
				note,
			},
			depth: 0,
			overrideAccess: true,
			context: MODERATION_CONTEXT,
			req,
		});
		await updateResaleListingHold(
			req,
			resellerShopId,
			"reseller",
			"link_inactive",
			"add",
			supplierShopId,
		);
		await writeLog(
			payload,
			{
				actor,
				action: "resale_link.suspend",
				targetType: "resale-link",
				targetId: linkId,
				reason,
				note,
				metadata: {
					previousStatus: link.status,
					listingIds: resaleListings.docs.map((listing) => String(listing.id)),
					commissions: snapshots,
				},
			},
			req,
		);
		if (
			!onCommit(commitContextOf(req), () =>
				notifyResaleLinkSuspended(payload, updated, "suspended", reason),
			)
		) {
			await notifyResaleLinkSuspended(payload, updated, "suspended", reason);
		}
		return updated;
	};
	return options.req
		? applySuspension(options.req)
		: withTransaction(payload, applySuspension, {
				user: actor,
				context: MODERATION_CONTEXT,
			});
}

export async function unsuspendResaleLink(
	payload: Payload,
	actor: Actor,
	linkId: string,
	input: { note?: string | null; releaseCommissions: boolean },
): Promise<ResaleLink> {
	assertModerator(actor);
	const initialLink = await findResaleLinkForModeration(payload, linkId);
	const { supplierShopId, resellerShopId } = await assertCanModerateResaleLink(
		payload,
		actor,
		initialLink,
	);
	const note = trimmed(input.note);

	return withTransaction(
		payload,
		async (req) => {
			const link = await findResaleLinkForModeration(payload, linkId, req);
			const currentParties = await assertCanModerateResaleLink(
				payload,
				actor,
				link,
				req,
			);
			if (
				currentParties.supplierShopId !== supplierShopId ||
				currentParties.resellerShopId !== resellerShopId
			) {
				throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
			}
			if (link.status !== "suspended" || link.suspendedBy !== "moderator") {
				throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
			}
			const entry = await lastEntry(
				payload,
				"resale-link",
				linkId,
				"resale_link.suspend",
				req,
			);
			if (!entry) {
				throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
			}
			const snapshots = commissionSnapshots(entry.metadata);
			const releasedCommissionIds: string[] = [];
			if (input.releaseCommissions) {
				for (const snapshot of snapshots) {
					const commission = await payload
						.findByID({
							collection: "reseller-commissions",
							id: snapshot.id,
							depth: 0,
							overrideAccess: true,
							req,
						})
						.catch(() => null);
					if (
						!commission ||
						commission.status !== "held" ||
						!(commission.holdReasons ?? []).includes("moderation")
					)
						continue;
					const remaining = Array.from(
						new Set<ResellerCommissionHoldReason>([
							...snapshot.previousHoldReasons.filter(
								(reason): reason is ResellerCommissionHoldReason =>
									reason !== "moderation",
							),
							...(commission.holdReasons ?? []).filter(
								(reason) => reason !== "moderation",
							),
						]),
					);
					await payload.update({
						collection: "reseller-commissions",
						id: commission.id,
						data: {
							status: remaining.length ? "held" : snapshot.previousStatus,
							holdReasons: remaining,
						},
						depth: 0,
						overrideAccess: true,
						req,
					});
					releasedCommissionIds.push(String(commission.id));
				}
			}

			const updated = await payload.update({
				collection: "resale-links",
				id: linkId,
				data: {
					status: "approved",
					suspendedBy: null,
					suspendedReason: null,
					decidedBy: actor.id,
					decidedAt: new Date().toISOString(),
					note,
				},
				depth: 0,
				overrideAccess: true,
				context: MODERATION_CONTEXT,
				req,
			});
			await updateResaleListingHold(
				req,
				resellerShopId,
				"reseller",
				"link_inactive",
				"remove",
				supplierShopId,
			);
			await writeLog(
				payload,
				{
					actor,
					action: "resale_link.unsuspend",
					targetType: "resale-link",
					targetId: linkId,
					note,
					metadata: {
						suspensionLogId: entry.id,
						releasedCommissionIds,
						listingIds: objectRecord(entry.metadata)
							? stringArray(objectRecord(entry.metadata)?.listingIds)
							: [],
					},
				},
				req,
			);
			if (
				!onCommit(commitContextOf(req), () =>
					notifyResaleLinkDecided(payload, updated, "approved"),
				)
			) {
				await notifyResaleLinkDecided(payload, updated, "approved");
			}
			return updated;
		},
		{ user: actor, context: MODERATION_CONTEXT },
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
	moderationLogIds: string[];
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
	options: { req?: PayloadRequest } = {},
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

	const applySuspension = async (req: PayloadRequest) => {
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

		const unpublishedListingIds = unpublished.docs.map((doc) => String(doc.id));

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
				and: [{ user: { equals: targetId } }, { status: { equals: "active" } }],
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

		const userSuspensionLog = await writeLog(
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
			moderationLogIds: [
				userSuspensionLog.id,
				...Object.values(shopSuspensionLogIds),
			],
		};
	};
	return options.req
		? applySuspension(options.req)
		: withTransaction(payload, applySuspension, { user: actor });
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
				await clearShopSuspension(payload, req, shopId, actor.id);
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

async function findShopForModeration(
	payload: Payload,
	id: string,
	req?: PayloadRequest,
) {
	try {
		return await payload.findByID({
			collection: "shops",
			id,
			depth: 0,
			overrideAccess: true,
			req,
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
	// Same transaction as the suspension: a suspended shop must never be left
	// able to take protected payments or receive payouts.
	await createHold(req, {
		scope: "shop",
		shop: shopId,
		reason: "shop_suspended",
		until: null,
		createdByType: "moderator",
		createdBy: suspension.suspendedBy,
	});
	await payload.update({
		collection: "shops",
		id: shopId,
		req,
		overrideAccess: true,
		context: SHOP_MODERATION_CONTEXT,
		data: { status: "suspended", ...suspension, suspensionLogId },
	});
}

/** `releasedBy` is null when the expiry job lifts the suspension. */
async function clearShopSuspension(
	payload: Payload,
	req: PayloadRequest,
	shopId: string,
	releasedBy: string | null,
) {
	for (const hold of await activeHolds(payload, { shop: shopId }, req)) {
		if (hold.reason === "shop_suspended") {
			await releaseHold(req, hold.id, { releasedBy });
		}
	}
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
	options: { req?: PayloadRequest } = {},
): Promise<{
	shopId: string;
	until: string | null;
	unpublishedListingIds: string[];
	moderationLogIds: string[];
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

	const applySuspension = async (req: PayloadRequest) => {
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
		// Every open order keeps running — suspension is not a cancellation —
		// but the buyer is told the shop behind it just went down.
		await postShopSuspensionMessages(payload, req, shopId);
		onCommit(commitContextOf(req), () =>
			notifyShopSuspended(shop, suspension.suspendedUntil, reason),
		);
		return {
			shopId: String(shopId),
			until: suspension.suspendedUntil,
			unpublishedListingIds,
			moderationLogIds: [logEntry.id],
		};
	};
	return options.req
		? applySuspension(options.req)
		: withTransaction(payload, applySuspension, { user: actor });
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
			await clearShopSuspension(payload, req, shopId, actor.id);
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
			await clearShopSuspension(payload, req, shopId, null);
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

// ─── Orders ──────────────────────────────────────────────────────────────────

/**
 * The three reasons `ORDER_CANCELLATION_REASONS` (collections/Orders.ts)
 * reserves for a staff-initiated cancellation; the other nine belong to the
 * buyer or the seller.
 */
export const STAFF_CANCEL_REASONS = [
	"staff_fraud",
	"staff_policy",
	"staff_other",
] as const;

export type StaffCancelReason = (typeof STAFF_CANCEL_REASONS)[number];

function parseStaffCancelReason(value: unknown): StaffCancelReason {
	if (
		typeof value === "string" &&
		(STAFF_CANCEL_REASONS as readonly string[]).includes(value)
	) {
		return value as StaffCancelReason;
	}
	throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
}

/**
 * The statuses a moderator's own cancellation lever reaches. `STATUS_TRANSITIONS`
 * would let `paid` and `disputed` through too — structurally valid, but
 * reserved for P5's payment flow and P6's arbitration respectively; a
 * moderator cancelling an order is a permission a staff review grants here,
 * never a reason to reach into either phase's own state.
 *
 * Exported so `order-actions-parity.int.spec.ts` can pin both clients' staff
 * rows to exactly this list rather than to a transcription of it.
 */
export const MODERATOR_CANCELLABLE_STATUSES: readonly Order["status"][] = [
	"placed",
	"confirmed",
	// The P4 spec's cancellation row for `paid` (l.564) lists staff; the P5
	// settlement handler already refunds a paid order on a staff cancel.
	"paid",
	"accepted",
	"shipped",
];

export async function findOrderForModeration(
	payload: Payload,
	id: string,
	req?: PayloadRequest,
): Promise<Order> {
	try {
		return await payload.findByID({
			collection: "orders",
			id,
			depth: 0,
			overrideAccess: true,
			req,
		});
	} catch {
		throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
	}
}

/**
 * Gives every reserved unit on the order back, whatever fulfilment stage it
 * reached — `release` itself is the idempotency and the no-throw guard
 * (Task 9): a line already sold rather than merely reserved simply finds its
 * condition unmet and logs instead of failing the cancellation that is
 * retiring it.
 */
async function releaseOrderStock(
	req: PayloadRequest,
	order: Order,
): Promise<void> {
	const items = await req.payload.find({
		collection: "order-items",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: { order: { equals: String(order.id) } },
	});
	for (const item of items.docs as OrderItem[]) {
		const variantId = relationId(item.variant);
		if (!variantId) continue;
		const variant = await req.payload.findByID({
			collection: "product-variants",
			id: variantId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		await release(req, {
			variant,
			quantity: item.quantity,
			orderId: String(order.id),
			orderRef: order.orderNumber,
		});
	}
}

export interface OrderCancellationResult {
	id: string;
	status: Order["status"];
}

/**
 * A moderator's own cancellation lever — a permission question
 * (`assertModerator`, the same gate every other action in this file asks),
 * not a status one: the status check below only bounds *which* live orders
 * a moderator may reach, the way `shop.suspend`'s own status guard does, and
 * carries no opinion about who may hold the lever.
 */
export async function cancelOrder(
	payload: Payload,
	actor: Actor,
	orderId: string,
	input: { reason: string; note?: string | null },
	options: { req?: PayloadRequest } = {},
): Promise<OrderCancellationResult> {
	assertModerator(actor);

	const reason = parseStaffCancelReason(input.reason);
	const note = trimmed(input.note);
	if (reason === "staff_other" && !note) {
		throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
	}

	const order = await findOrderForModeration(payload, orderId, options.req);
	if (!MODERATOR_CANCELLABLE_STATUSES.includes(order.status)) {
		throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
	}

	const applyCancellation = async (req: PayloadRequest) => {
		// Re-read inside the transaction: the same race `suspendShop` guards
		// against between its own pre-transaction read and its write.
		const current = await findOrderForModeration(payload, orderId, req);
		if (!MODERATOR_CANCELLABLE_STATUSES.includes(current.status)) {
			throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
		}

		const { order: updated } = await applyTransition(
			req,
			current,
			{
				status: "cancelled",
				...(current.paymentStatus === "cod_pending"
					? { paymentStatus: "unpaid" as const }
					: {}),
				set: {
					cancellation: {
						...(current.cancellation ?? {}),
						by: "staff",
						reason,
						note,
					},
					timestamps: {
						...(current.timestamps ?? {}),
						cancelledAt: new Date().toISOString(),
					},
				},
			},
			{
				type: "order.cancelled",
				actorType: "staff",
				actor: actor.id,
				reason,
				note,
				visibility: "both",
				source: "staff_console",
			},
		);

		await releaseOrderStock(req, updated);

		await writeLog(
			payload,
			{
				actor,
				action: "order.cancel",
				targetType: "order",
				targetId: orderId,
				reason,
				note,
				metadata: {
					orderNumber: updated.orderNumber,
					previousStatus: current.status,
				},
			},
			req,
		);

		return { id: String(updated.id), status: updated.status };
	};
	return options.req
		? applyCancellation(options.req)
		: withTransaction(payload, applyCancellation, { user: actor });
}

/**
 * A plain system line, not an `order-events` entry: a shop suspension is not
 * one of `applyTransition`'s own transitions and must never be mistaken for
 * one in the order's own timeline. `suspendShop` cancels nothing — every
 * open order keeps running exactly as it was, under a shop that can no
 * longer take new ones — so this only tells the buyer their order may slip,
 * the same way any other delay would.
 */
async function postShopSuspensionMessages(
	payload: Payload,
	req: PayloadRequest,
	shopId: string,
): Promise<void> {
	const orders = await payload.find({
		collection: "orders",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: { shop: { equals: shopId } },
	});

	for (const doc of orders.docs as Order[]) {
		if (TERMINAL_STATUSES.includes(doc.status)) continue;

		const conversations = await payload.find({
			collection: "conversations",
			depth: 0,
			limit: 1,
			overrideAccess: true,
			req,
			where: { order: { equals: String(doc.id) } },
		});
		const conversationId = conversations.docs[0]?.id;
		if (!conversationId) continue;

		const content = `La boutique est suspendue ; la commande ${doc.orderNumber} peut être retardée.`;
		const systemParams = { orderNumber: doc.orderNumber };
		const message = await payload.create({
			collection: "messages",
			req,
			overrideAccess: true,
			context: ORDER_SERVICE_CONTEXT,
			data: {
				conversation: conversationId,
				kind: "system",
				sender: null,
				content,
				systemEvent: "shop.suspended",
				systemParams,
				order: doc.id,
			},
		});

		await queueSystemMessage(req, {
			type: "order.system_message",
			conversationId: String(conversationId),
			messageId: String(message.id),
			kind: "system",
			systemEvent: "shop.suspended",
			systemParams,
			content,
			createdAt: String(message.createdAt),
		});
	}
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

export async function decideRiskFlag(
	payload: Payload,
	actor: Actor,
	flagId: string,
	input: RiskFlagDecisionInput,
): Promise<{ id: string; status: RiskFlag["status"] }> {
	assertModerator(actor);
	const note = trimmed(input.note);
	if (
		(input.outcome === "dismissed" || input.outcome === "actioned") &&
		!note
	) {
		throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
	}
	if (input.outcome === "actioned" && !input.action) {
		throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
	}
	const resolution = input.resolution ?? "none";
	if (
		(input.outcome === "dismissed" || input.outcome === "actioned") &&
		(!resolution || resolution === "none")
	) {
		throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
	}
	const linkedActions: string[] = [];
	if (input.outcome === "actioned" && input.action) {
		if (
			input.action.type === "hold_payouts" &&
			!isPayoutHoldReason(input.action.reason)
		) {
			throw new ModerationError(ERROR_CODES.moderationReasonInvalid, 400);
		}
		if (
			(input.action.type === "suspend_user" &&
				resolution !== "user_suspended") ||
			(input.action.type === "suspend_shop" &&
				resolution !== "shop_suspended") ||
			(input.action.type === "hold_payouts" && resolution !== "payouts_held") ||
			(input.action.type === "release_holds" &&
				resolution !== "false_positive") ||
			(input.action.type === "suspend_resale_link" &&
				resolution !== "resale_link_suspended") ||
			(input.action.type === "cancel_order" && resolution !== "order_cancelled")
		) {
			throw new ModerationError(ERROR_CODES.moderationReasonInvalid, 400);
		}
	}

	return withTransaction(
		payload,
		async (req) => {
			let flag: RiskFlag;
			try {
				flag = await payload.findByID({
					collection: "risk-flags",
					id: flagId,
					depth: 0,
					overrideAccess: true,
					req,
				});
			} catch {
				throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
			}
			const reviewedAt = Date.parse(flag.reviewedAt ?? flag.lastSeenAt);
			const reviewAge = Date.now() - reviewedAt;
			const transitionAllowed =
				flag.status === "open" ||
				((input.outcome === "dismissed" || input.outcome === "actioned") &&
					flag.status === "reviewed" &&
					reviewAge >= 0 &&
					reviewAge <= 30 * 86_400_000);
			if (!transitionAllowed) {
				throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
			}
			if (input.outcome === "actioned" && input.action) {
				const actionHold =
					input.action.type === "release_holds"
						? await payload
								.findByID({
									collection: "payout-holds",
									id: input.action.targetId,
									depth: 0,
									overrideAccess: true,
									req,
								})
								.catch(() => null)
						: null;
				const actionLink =
					input.action.type === "suspend_resale_link"
						? await payload
								.findByID({
									collection: "resale-links",
									id: input.action.targetId,
									depth: 0,
									overrideAccess: true,
									req,
								})
								.catch(() => null)
						: null;
				const actionOrder =
					input.action.type === "cancel_order"
						? await payload
								.findByID({
									collection: "orders",
									id: input.action.targetId,
									depth: 0,
									overrideAccess: true,
									req,
								})
								.catch(() => null)
						: null;
				const expectedSubjectType =
					input.action.type === "suspend_user" ? "user" : "shop";
				const targetMatchesFlag =
					input.action.type === "release_holds"
						? flag.subjectType === "shop" &&
							relationId(actionHold?.shop) === flag.subjectKey
						: input.action.type === "suspend_resale_link"
							? flag.subjectType === "shop" &&
								[
									relationId(actionLink?.supplierShop),
									relationId(actionLink?.resellerShop),
								].includes(flag.subjectKey)
							: input.action.type === "cancel_order"
								? (flag.subjectType === "shop" &&
										relationId(actionOrder?.shop) === flag.subjectKey) ||
									(flag.subjectType === "user" &&
										relationId(actionOrder?.buyer) === flag.subjectKey)
								: flag.subjectType === expectedSubjectType &&
									flag.subjectKey === input.action.targetId;
				if (!targetMatchesFlag) {
					throw new ModerationError(ERROR_CODES.moderationReasonInvalid, 400);
				}
				if (input.action.type === "release_holds") {
					const released = await releasePayoutHold(
						payload,
						actor,
						input.action.targetId,
						{ note, shopId: flag.subjectKey },
						{ req },
					);
					const actionLog = await payload.find({
						collection: "moderation-log",
						where: {
							and: [
								{ action: { equals: "payout.release" } },
								{ targetId: { equals: flag.subjectKey } },
								{ "metadata.holdId": { equals: String(released.id) } },
							],
						},
						limit: 1,
						pagination: false,
						depth: 0,
						overrideAccess: true,
						req,
					});
					const actionLogId = actionLog.docs[0]?.id;
					if (!actionLogId)
						throw new Error("Payout release moderation log was not written.");
					linkedActions.push(String(actionLogId));
				} else if (input.action.type === "cancel_order") {
					await cancelOrder(
						payload,
						actor,
						input.action.targetId,
						{ reason: input.action.reason, note },
						{ req },
					);
					const actionLog = await payload.find({
						collection: "moderation-log",
						where: {
							and: [
								{ action: { equals: "order.cancel" } },
								{ targetId: { equals: input.action.targetId } },
							],
						},
						limit: 1,
						pagination: false,
						depth: 0,
						overrideAccess: true,
						req,
					});
					const actionLogId = actionLog.docs[0]?.id;
					if (!actionLogId)
						throw new Error(
							"Order cancellation moderation log was not written.",
						);
					linkedActions.push(String(actionLogId));
				} else if (input.action.type === "suspend_resale_link") {
					await suspendResaleLink(
						payload,
						actor,
						input.action.targetId,
						{ reason: input.action.reason, note },
						{ req },
					);
					const actionLog = await payload.find({
						collection: "moderation-log",
						where: {
							and: [
								{ action: { equals: "resale_link.suspend" } },
								{ targetId: { equals: input.action.targetId } },
							],
						},
						limit: 1,
						pagination: false,
						depth: 0,
						overrideAccess: true,
						req,
					});
					const actionLogId = actionLog.docs[0]?.id;
					if (!actionLogId)
						throw new Error("Resale-link moderation log was not written.");
					linkedActions.push(String(actionLogId));
				} else if (input.action.type === "suspend_user") {
					const result = await suspendUser(
						payload,
						actor,
						input.action.targetId,
						{
							reason: input.action.reason,
							durationDays: input.action.durationDays,
							note,
						},
						{ req },
					);
					linkedActions.push(...result.moderationLogIds);
				} else if (input.action.type === "suspend_shop") {
					const result = await suspendShop(
						payload,
						actor,
						input.action.targetId,
						{
							reason: input.action.reason,
							durationDays: input.action.durationDays,
							note,
						},
						{ req },
					);
					linkedActions.push(...result.moderationLogIds);
				} else if (input.action.type === "hold_payouts") {
					if (!isPayoutHoldReason(input.action.reason)) {
						throw new ModerationError(
							ERROR_CODES.moderationReasonInvalid,
							400,
						);
					}
					const hold = await holdPayouts(
						payload,
						actor,
						input.action.targetId,
						{
							scope: "shop",
							reason: input.action.reason,
							untilDays: input.action.durationDays,
							note,
						},
						{ req },
					);
					const actionLog = await payload.find({
						collection: "moderation-log",
						where: {
							and: [
								{ action: { equals: "payout.hold" } },
								{ targetId: { equals: input.action.targetId } },
								{ "metadata.holdId": { equals: String(hold.id) } },
							],
						},
						limit: 1,
						pagination: false,
						depth: 0,
						overrideAccess: true,
						req,
					});
					const actionLogId = actionLog.docs[0]?.id;
					if (!actionLogId)
						throw new Error("Payout hold moderation log was not written.");
					linkedActions.push(String(actionLogId));
				} else {
					throw new ModerationError(ERROR_CODES.moderationReasonInvalid, 400);
				}
			}
			const status = input.outcome;
			const decidedAt = new Date();
			const updated = await payload.update({
				collection: "risk-flags",
				id: flag.id,
				overrideAccess: true,
				context: MODERATION_CONTEXT,
				req,
				data: {
					status,
					resolution,
					resolutionNote: note ?? undefined,
					reviewedBy: actor.id,
					reviewedAt: decidedAt.toISOString(),
					purgeAt: riskFlagRetentionDate(status, decidedAt),
				},
			});

			if (
				status === "dismissed" &&
				resolution === "false_positive" &&
				flag.autoEffects?.includes("payout_hold")
			) {
				const holds = await payload.find({
					collection: "payout-holds",
					where: {
						and: [
							{ status: { equals: "active" } },
							{ note: { equals: `risk-flag:${flag.id}` } },
						],
					},
					limit: 0,
					pagination: false,
					depth: 0,
					overrideAccess: true,
					req,
				});
				for (const hold of holds.docs) {
					await releaseHold(req, String(hold.id), {
						releasedBy: actor.id,
						note: `Released after risk flag ${flag.id} was dismissed as a false positive.`,
					});
				}
			}

			await writeLog(
				payload,
				{
					actor,
					action:
						status === "reviewed"
							? "risk_flag.review"
							: status === "actioned"
								? "risk_flag.action"
								: "risk_flag.dismiss",
					targetType: "risk-flag",
					targetId: String(flag.id),
					reason: resolution,
					note,
					metadata: {
						signal: flag.signal,
						score: flag.score,
						previousStatus: flag.status,
						resolution,
						...(linkedActions.length ? { linkedActions } : {}),
					},
				},
				req,
			);
			return { id: String(updated.id), status: updated.status };
		},
		{ user: actor, context: MODERATION_CONTEXT },
	);
}

// ─── Payouts ─────────────────────────────────────────────────────────────────

/**
 * Who may lift a hold early, by reason. `shop_suspended` is absent on purpose:
 * it is the suspension's own hold and only `unsuspendShop` (or the expiry
 * job) may end it, or the shop would be suspended with its money flowing.
 */
const HOLD_RELEASE_RANK: Partial<
	Record<PayoutHoldReason, "moderator" | "admin">
> = {
	moderation: "moderator",
	dispute_open: "moderator",
	return_open: "moderator",
	fraud_signal: "admin",
	reconciliation_mismatch: "admin",
	payout_failed_repeatedly: "admin",
	payout_account_changed: "admin",
};

/** Reasons staff may not place by hand: the suspension owns its hold. */
const SYSTEM_ONLY_HOLD_REASONS: readonly PayoutHoldReason[] = [
	"shop_suspended",
];

/**
 * Staff who belong to the shop — its owner or an active member, whatever
 * their shop role — never act on its money.
 */
async function assertNotShopMember(
	payload: Payload,
	actor: Actor,
	shop: Shop,
	req?: PayloadRequest,
): Promise<void> {
	if (relationId(shop.owner) === String(actor.id)) {
		throw new ModerationError(ERROR_CODES.moderationForbidden, 403);
	}
	const { totalDocs } = await payload.count({
		collection: "shop-members",
		overrideAccess: true,
		req,
		where: {
			and: [
				{ shop: { equals: String(shop.id) } },
				{ user: { equals: String(actor.id) } },
				{ status: { equals: "active" } },
			],
		},
	});
	if (totalDocs > 0) {
		throw new ModerationError(ERROR_CODES.moderationForbidden, 403);
	}
}

function holdLogMetadata(hold: PayoutHold): Record<string, unknown> {
	return {
		holdId: String(hold.id),
		scope: hold.scope,
		orderId: relationId(hold.order),
		reason: hold.reason,
		until: hold.until ?? null,
	};
}

export interface HoldPayoutsInput {
	scope: PayoutHold["scope"];
	orderId?: string | null;
	reason: PayoutHoldReason;
	/** Null or omitted: until someone releases it. */
	untilDays?: number | null;
	blocksCharges?: boolean;
	note?: string | null;
}

export async function holdPayouts(
	payload: Payload,
	actor: Actor,
	shopId: string,
	input: HoldPayoutsInput,
	options: { req?: PayloadRequest } = {},
): Promise<PayoutHold> {
	assertModerator(actor);
	if (SYSTEM_ONLY_HOLD_REASONS.includes(input.reason)) {
		throw new ModerationError(ERROR_CODES.moderationReasonInvalid, 400);
	}
	const shop = await findShopForModeration(payload, shopId);
	await assertNotShopMember(payload, actor, shop);

	const orderId = input.scope === "order" ? (input.orderId ?? null) : null;
	if (input.scope === "order") {
		const order = orderId
			? await payload
					.findByID({
						collection: "orders",
						id: orderId,
						depth: 0,
						overrideAccess: true,
					})
					.catch(() => null)
			: null;
		if (!order || relationId(order.shop) !== String(shopId)) {
			throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
		}
	}
	const until =
		input.untilDays == null
			? null
			: new Date(Date.now() + input.untilDays * 86_400_000).toISOString();
	const note = trimmed(input.note);

	const placeHold = async (req: PayloadRequest) => {
		const key = {
			scope: input.scope,
			shop: String(shopId),
			order: orderId,
			reason: input.reason,
		};
		// `createHold` would hand the open one back; a second log entry
		// claiming a hold this moderator did not place would be a lie.
		if (await findActiveHold(req, key)) {
			throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
		}
		const hold = await createHold(req, {
			...key,
			until,
			blocksCharges: input.blocksCharges === true,
			createdByType: "moderator",
			createdBy: actor.id,
			note,
		});
		await writeLog(
			payload,
			{
				actor,
				action: "payout.hold",
				targetType: "shop",
				targetId: String(shopId),
				reason: hold.reason,
				note,
				metadata: holdLogMetadata(hold),
			},
			req,
		);
		onCommit(commitContextOf(req), () =>
			notifyPayoutHoldPlaced(shop, {
				holdId: String(hold.id),
				scope: hold.scope,
				orderId: relationId(hold.order),
				category: holdReasonCategory(hold.reason),
				checkPayoutAccount: false,
			}),
		);
		return hold;
	};
	return options.req
		? placeHold(options.req)
		: withTransaction(payload, placeHold, { user: actor });
}

/**
 * The rank ladder applies to every active hold, the system's included: a hold
 * the not-me path escalated in place to `fraud_signal` was never logged, so
 * its release here is the first moderation entry it gets.
 */
export async function releasePayoutHold(
	payload: Payload,
	actor: Actor,
	holdId: string,
	input: { note?: string | null; shopId?: string } = {},
	options: { req?: PayloadRequest } = {},
): Promise<PayoutHold> {
	assertModerator(actor);
	const hold = await payload
		.findByID({
			collection: "payout-holds",
			id: holdId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const shopId = hold ? relationId(hold.shop) : null;
	if (!hold || !shopId || (input.shopId && input.shopId !== shopId)) {
		throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
	}
	const shop = await findShopForModeration(payload, shopId);
	await assertNotShopMember(payload, actor, shop);

	const rank = HOLD_RELEASE_RANK[hold.reason];
	if (!rank) {
		throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
	}
	if (rank === "admin" && !isAdmin(actor)) {
		throw new ModerationError(ERROR_CODES.moderationRankTooLow, 403);
	}
	const note = trimmed(input.note);

	const applyRelease = async (req: PayloadRequest) => {
		const current = await payload.findByID({
			collection: "payout-holds",
			id: holdId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		// Re-read in the transaction: the expiry job or another moderator
		// may have ended it, and the ladder must judge the reason it has now.
		if (current.status !== "active" || current.reason !== hold.reason) {
			throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
		}
		const released = await releaseHold(req, holdId, {
			releasedBy: actor.id,
			note,
		});
		await writeLog(
			payload,
			{
				actor,
				action: "payout.release",
				targetType: "shop",
				targetId: shopId,
				reason: released.reason,
				note,
				metadata: holdLogMetadata(released),
			},
			req,
		);
		onCommit(commitContextOf(req), () =>
			notifyPayoutHoldReleased(shop, {
				holdId: String(released.id),
				scope: released.scope,
				orderId: relationId(released.order),
				category: holdReasonCategory(released.reason),
				cause: "released",
			}),
		);
		return released;
	};
	return options.req
		? applyRelease(options.req)
		: withTransaction(payload, applyRelease, { user: actor });
}

export interface PayoutAccountDecision {
	accountId: string;
	status: PayoutAccount["status"];
	replacedAccountIds: string[];
	holdUntil: string | null;
}

async function decidePayoutAccount(
	payload: Payload,
	actor: Actor,
	shopId: string,
	accountId: string,
	outcome: "approve" | "reject",
	note: string | null,
): Promise<PayoutAccountDecision> {
	assertModerator(actor);
	const shop = await findShopForModeration(payload, shopId);
	await assertNotShopMember(payload, actor, shop);

	return withTransaction(
		payload,
		async (req) => {
			const account = await payload
				.findByID({
					collection: "payout-accounts",
					id: accountId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			if (!account || relationId(account.shop) !== String(shopId)) {
				throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
			}
			if (account.status !== "pending_review") {
				throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
			}

			let decision: PayoutAccountDecision;
			if (outcome === "approve") {
				const activation = await activateReviewedPayoutAccount(
					req,
					shop,
					account,
				);
				decision = {
					accountId: String(account.id),
					status: activation.account.status,
					replacedAccountIds: activation.replaced.map((row) => String(row.id)),
					holdUntil: activation.holdUntil,
				};
			} else {
				const rejected = await payload.update({
					collection: "payout-accounts",
					id: account.id,
					overrideAccess: true,
					req,
					data: { status: "rejected" },
				});
				decision = {
					accountId: String(rejected.id),
					status: rejected.status,
					replacedAccountIds: [],
					holdUntil: null,
				};
			}

			await writeLog(
				payload,
				{
					actor,
					action:
						outcome === "approve"
							? "payout.account_approve"
							: "payout.account_reject",
					targetType: "shop",
					targetId: String(shopId),
					note,
					metadata: {
						accountId: String(account.id),
						method: account.method,
						accountNumberMasked: account.accountNumberMasked ?? "",
						nameMatch: account.nameMatch?.result ?? null,
						replacedAccountIds: decision.replacedAccountIds,
						holdUntil: decision.holdUntil,
					},
				},
				req,
			);
			return decision;
		},
		{ user: actor },
	);
}

/** A `pending_review` row becomes the shop's active account. */
export async function approvePayoutAccount(
	payload: Payload,
	actor: Actor,
	shopId: string,
	accountId: string,
	input: { note?: string | null } = {},
): Promise<PayoutAccountDecision> {
	return decidePayoutAccount(
		payload,
		actor,
		shopId,
		accountId,
		"approve",
		trimmed(input.note),
	);
}

export async function rejectPayoutAccount(
	payload: Payload,
	actor: Actor,
	shopId: string,
	accountId: string,
	input: { note?: string | null } = {},
): Promise<PayoutAccountDecision> {
	return decidePayoutAccount(
		payload,
		actor,
		shopId,
		accountId,
		"reject",
		trimmed(input.note),
	);
}

// ─── The shop sheet's payments block ─────────────────────────────────────────

export const SHEET_LAST_PAYOUTS = 5;

/**
 * Staff see the hold's reason and its note, unlike the seller's setup view,
 * which gets the category alone. Every active hold is listed, the system's
 * as much as a moderator's, so one escalated in place is never invisible.
 */
export interface ShopPaymentsSheet {
	connectedAccount: null | {
		status: ConnectedAccount["status"];
		chargesEnabled: boolean;
		payoutsEnabled: boolean;
		lastSyncedAt: string | null;
	};
	payoutAccount: null | {
		id: string;
		method: PayoutAccount["method"];
		accountName: string;
		accountNumberMasked: string;
		activatedAt: string | null;
	};
	pendingAccounts: Array<{
		id: string;
		method: PayoutAccount["method"];
		accountName: string;
		accountNumberMasked: string;
		nameMatch: null | {
			result: "match" | "partial" | "mismatch";
			identityName: string | null;
			score: number | null;
		};
		createdAt: string;
	}>;
	holds: Array<{
		id: string;
		scope: PayoutHold["scope"];
		orderId: string | null;
		reason: PayoutHoldReason;
		reasonCategory: PayoutHoldCategory;
		blocksCharges: boolean;
		until: string | null;
		createdByType: PayoutHold["createdByType"];
		createdBy: string | null;
		note: string | null;
		createdAt: string;
	}>;
	openExposure: number;
	lastPayouts: Array<{
		id: string;
		amount: number;
		currency: string;
		status: Payout["status"];
		origin: Payout["origin"];
		failureReason: string | null;
		createdAt: string;
	}>;
	refundRate: ShopRefundRate;
}

export async function shopPaymentsSheet(
	payload: Payload,
	shopId: string,
): Promise<ShopPaymentsSheet> {
	const [account, accounts, holds, openExposure, payouts, refundRate] =
		await Promise.all([
			findConnectedAccount(payload, shopId),
			payload.find({
				collection: "payout-accounts",
				where: {
					and: [
						{ shop: { equals: shopId } },
						{ status: { in: ["active", "pending_review"] } },
					],
				},
				sort: "createdAt",
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
			}),
			activeHolds(payload, { shop: shopId }),
			openProtectedExposure(payload, shopId),
			payload.find({
				collection: "payouts",
				where: { shop: { equals: shopId } },
				sort: "-createdAt",
				depth: 0,
				limit: SHEET_LAST_PAYOUTS,
				overrideAccess: true,
			}),
			shopRefundRate(payload, shopId),
		]);

	const active = accounts.docs.find((row) => row.status === "active");
	return {
		connectedAccount: account
			? {
					status: account.status,
					chargesEnabled: account.chargesEnabled === true,
					payoutsEnabled: account.payoutsEnabled === true,
					lastSyncedAt: account.lastSyncedAt ?? null,
				}
			: null,
		payoutAccount: active
			? {
					id: String(active.id),
					method: active.method,
					accountName: active.accountName,
					accountNumberMasked: active.accountNumberMasked ?? "",
					activatedAt: active.activatedAt ?? null,
				}
			: null,
		pendingAccounts: accounts.docs
			.filter((row) => row.status === "pending_review")
			.map((row) => ({
				id: String(row.id),
				method: row.method,
				accountName: row.accountName,
				accountNumberMasked: row.accountNumberMasked ?? "",
				nameMatch: row.nameMatch?.result
					? {
							result: row.nameMatch.result,
							identityName: row.nameMatch.identityName ?? null,
							score: row.nameMatch.score ?? null,
						}
					: null,
				createdAt: row.createdAt,
			})),
		holds: holds.map((hold) => ({
			id: String(hold.id),
			scope: hold.scope,
			orderId: relationId(hold.order),
			reason: hold.reason,
			reasonCategory: holdReasonCategory(hold.reason),
			blocksCharges: hold.blocksCharges === true,
			until: hold.until ?? null,
			createdByType: hold.createdByType,
			createdBy: relationId(hold.createdBy),
			note: hold.note ?? null,
			createdAt: hold.createdAt,
		})),
		openExposure,
		lastPayouts: payouts.docs.map((payout) => ({
			id: String(payout.id),
			amount: payout.amount,
			currency: payout.currency,
			status: payout.status,
			origin: payout.origin,
			failureReason: payout.failureReason ?? null,
			createdAt: payout.createdAt,
		})),
		refundRate,
	};
}
