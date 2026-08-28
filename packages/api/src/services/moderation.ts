import type { Payload } from "payload";
import {
	type ActorLike,
	canActOn,
	isModerator,
	ModerationRuleError,
	resolveSuspensionUntil,
	suspensionSummary,
} from "../access/roles";
import type { ModerationAction } from "../collections/ModerationLog";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";

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

export class ModerationError extends Error {
	code: ErrorCode;
	status: number;

	constructor(code: ErrorCode, status: number, message?: string) {
		super(message ?? code);
		this.name = "ModerationError";
		this.code = code;
		this.status = status;
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
	targetType: "listing" | "user" | "report";
	targetId: string;
	reason?: string | null;
	note?: string | null;
	metadata?: Record<string, unknown>;
}

async function writeLog(payload: Payload, input: LogInput): Promise<void> {
	await payload.create({
		collection: "moderation-log",
		overrideAccess: true,
		context: MODERATION_CONTEXT,
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
}

function assertModerator(actor: Actor): void {
	if (!isModerator(actor)) {
		throw new ModerationError(ERROR_CODES.moderationForbidden, 403);
	}
}

function trimmed(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
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

	const updated = await payload.update({
		collection: "listings",
		id: listingId,
		overrideAccess: true,
		context: MODERATION_CONTEXT,
		data: { status: "published", rejectionReason: null },
	});

	await writeLog(payload, {
		actor,
		action: "listing.approve",
		targetType: "listing",
		targetId: listingId,
		note: trimmed(note),
		metadata: { previousStatus: listing.status },
	});

	return {
		id: String(updated.id),
		status: String(updated.status),
		title: String(updated.title ?? ""),
	};
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

	const updated = await payload.update({
		collection: "listings",
		id: listingId,
		overrideAccess: true,
		context: MODERATION_CONTEXT,
		data: { status: "rejected", rejectionReason: cleanReason },
	});

	await writeLog(payload, {
		actor,
		action:
			listing.status === "published" ? "listing.takedown" : "listing.reject",
		targetType: "listing",
		targetId: listingId,
		reason: cleanReason,
		note: trimmed(note),
		metadata: { previousStatus: listing.status },
	});

	return {
		id: String(updated.id),
		status: String(updated.status),
		title: String(updated.title ?? ""),
	};
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

	let until: Date | null;
	try {
		until = resolveSuspensionUntil(actor, input.durationDays);
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
			overrideAccess: true,
			context: MODERATION_CONTEXT,
			data: { status: "draft" },
		});
	}

	await payload.update({
		collection: "users",
		id: targetId,
		overrideAccess: true,
		context: MODERATION_CONTEXT,
		data: {
			suspendedAt: new Date().toISOString(),
			suspendedUntil: until ? until.toISOString() : null,
			suspendedReason: reason,
			suspendedNote: trimmed(input.note),
			suspendedBy: actor.id,
		},
	});

	await writeLog(payload, {
		actor,
		action: "user.suspend",
		targetType: "user",
		targetId,
		reason,
		note: trimmed(input.note),
		metadata: {
			until: until ? until.toISOString() : null,
			durationDays: input.durationDays ?? null,
			unpublishedListingIds,
		},
	});

	return {
		userId: String(targetId),
		until: until ? until.toISOString() : null,
		unpublishedListingIds,
	};
}

export async function unsuspendUser(
	payload: Payload,
	actor: Actor,
	targetId: string,
	input: { note?: string | null; restoreListings?: boolean } = {},
): Promise<{ userId: string; restoredListingIds: string[] }> {
	assertModerator(actor);

	const target = await findUser(payload, targetId);
	if (!canActOn(actor, target as ActorLike)) {
		throw new ModerationError(ERROR_CODES.moderationRankTooLow, 403);
	}

	const summary = suspensionSummary(target as never);
	if (!summary.active && !summary.expired) {
		throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
	}

	const restore = input.restoreListings !== false;
	const restoredListingIds = restore
		? await restoreSuspendedListings(payload, targetId)
		: [];

	await payload.update({
		collection: "users",
		id: targetId,
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

	await writeLog(payload, {
		actor,
		action: "user.unsuspend",
		targetType: "user",
		targetId,
		note: trimmed(input.note),
		metadata: { restoredListingIds, wasExpired: summary.expired },
	});

	return { userId: String(targetId), restoredListingIds };
}

/**
 * Restores only what the most recent suspension actually took down, and only
 * if it is still sitting in draft — a listing the seller has since sold or
 * deleted must not be dragged back online.
 */
async function restoreSuspendedListings(
	payload: Payload,
	targetId: string,
): Promise<string[]> {
	const lastSuspend = await payload.find({
		collection: "moderation-log",
		depth: 0,
		limit: 1,
		sort: "-createdAt",
		overrideAccess: true,
		where: {
			and: [
				{ targetType: { equals: "user" } },
				{ targetId: { equals: String(targetId) } },
				{ action: { equals: "user.suspend" } },
			],
		},
	});

	const metadata = lastSuspend.docs[0]?.metadata as
		| { unpublishedListingIds?: unknown }
		| undefined;
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
			});
			if (listing.status !== "draft") continue;

			await payload.update({
				collection: "listings",
				id,
				overrideAccess: true,
				context: MODERATION_CONTEXT,
				data: { status: "published" },
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
