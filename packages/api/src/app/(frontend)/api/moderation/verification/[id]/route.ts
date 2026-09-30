import { z } from "zod";
import { canActOn, isAdmin } from "@/access/roles";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	handleModerationError,
	type ModerationContext,
	readJson,
	requireModerator,
} from "@/lib/moderationRoute";
import { relationId } from "@/lib/relationId";
import { ServiceError } from "@/lib/serviceError";
import { canTransition } from "@/lib/verificationTransitions";
import type { Shop, VerificationRequest } from "@/payload-types";
import {
	approveRequest,
	claimRequest,
	rejectRequest,
	releaseRequest,
	requestInfo,
	revokeRequest,
} from "@/services/verification";

/**
 * `services/verification.ts` raises a plain `ServiceError`, not the
 * `ModerationError` `handleModerationError` (lib/moderationRoute.ts) knows
 * about — so a business refusal (a stale claim, an incomplete checklist, a
 * decision by someone who is not the assignee) would otherwise fall through
 * to that helper's generic 500 rather than the code it actually carries.
 */
function handleVerificationError(scope: string, error: unknown): Response {
	if (error instanceof ServiceError) {
		return errorResponse(error.code, error.status);
	}
	return handleModerationError(scope, error);
}

/**
 * Owner, or any `shop-members` row in the shop: mirrors the check
 * `services/verification.ts`'s own `assertNoConflict` makes before every
 * claim and decision. Not exported from that module, so the read-only view
 * here makes the same two checks rather than reaching into a private helper.
 */
async function isShopConflict(
	ctx: ModerationContext,
	actorId: string,
	shop: Shop,
): Promise<boolean> {
	if (relationId(shop.owner) === actorId) return true;
	const membership = await ctx.payload.find({
		collection: "shop-members",
		depth: 0,
		limit: 1,
		pagination: false,
		overrideAccess: true,
		where: {
			and: [{ shop: { equals: shop.id } }, { user: { equals: actorId } }],
		},
	});
	return membership.docs.length > 0;
}

interface DocumentDoc {
	id: unknown;
	kind?: unknown;
	originalFilename?: unknown;
	sha256?: unknown;
	uploadedBy?: unknown;
	duplicateOf?: unknown;
	purgedAt?: unknown;
}

/**
 * Metadata only: never the upload's own `url`/`filename`/`mimeType` fields.
 * The only door to the bytes is the logged, 60-second signed URL from Task 15.
 */
function documentMeta(doc: DocumentDoc) {
	return {
		id: String(doc.id),
		kind: doc.kind ?? null,
		originalFilename: doc.originalFilename ?? null,
		sha256: doc.sha256 ?? null,
		uploadedBy: relationId(doc.uploadedBy),
		duplicateOf: Array.isArray(doc.duplicateOf)
			? doc.duplicateOf.map((entry) => relationId(entry))
			: [],
		purgedAt: doc.purgedAt ?? null,
	};
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	const { id } = await params;

	try {
		const verificationRequest = await ctx.payload
			.findByID({
				collection: "verification-requests",
				id,
				depth: 0,
				overrideAccess: true,
			})
			.catch(() => null);
		if (!verificationRequest) return errorResponse(ERROR_CODES.notFound, 404);

		const shopId = relationId(verificationRequest.shop);
		const shop = shopId
			? await ctx.payload
					.findByID({
						collection: "shops",
						id: shopId,
						depth: 0,
						overrideAccess: true,
					})
					.catch(() => null)
			: null;
		if (!shop) return errorResponse(ERROR_CODES.notFound, 404);

		const ownerId = relationId(verificationRequest.submittedBy);
		const owner = ownerId
			? await ctx.payload
					.findByID({
						collection: "users",
						id: ownerId,
						depth: 0,
						overrideAccess: true,
					})
					.catch(() => null)
			: null;

		// The `documents` join field on `VerificationRequests` has never been
		// proven to resolve (Task 12's finding: the fake has no join support),
		// so documents are always their own direct query, never `request.documents`.
		const [documents, otherRequests, log] = await Promise.all([
			ctx.payload.find({
				collection: "verification-documents",
				depth: 0,
				pagination: false,
				overrideAccess: true,
				where: { request: { equals: id } },
			}),
			ctx.payload.find({
				collection: "verification-requests",
				depth: 0,
				pagination: false,
				overrideAccess: true,
				sort: "-createdAt",
				where: {
					and: [{ shop: { equals: shopId } }, { id: { not_equals: id } }],
				},
			}),
			ctx.payload.find({
				collection: "moderation-log",
				depth: 0,
				pagination: false,
				overrideAccess: true,
				sort: "-createdAt",
				where: {
					and: [
						{ targetType: { equals: "verification-request" } },
						{ targetId: { equals: String(id) } },
					],
				},
			}),
		]);

		const conflictOfInterest = await isShopConflict(ctx, ctx.actor.id, shop);
		const assigneeId = relationId(verificationRequest.assignee);
		const isAssignee = assigneeId === ctx.actor.id;
		const rankOk = canActOn(ctx.actor, owner ?? undefined);

		return Response.json({
			request: {
				id: String(verificationRequest.id),
				shop: shopId,
				requestedLevel: verificationRequest.requestedLevel,
				status: verificationRequest.status,
				statusHistory: verificationRequest.statusHistory ?? [],
				consent: verificationRequest.consent ?? null,
				kyc: verificationRequest.kyc ?? null,
				business: verificationRequest.business ?? null,
				reviewSignals: verificationRequest.reviewSignals ?? [],
				assignee: assigneeId,
				claimedAt: verificationRequest.claimedAt ?? null,
				infoRequests: verificationRequest.infoRequests ?? [],
				decision: verificationRequest.decision ?? null,
				submittedAt: verificationRequest.submittedAt ?? null,
				approvedAt: verificationRequest.approvedAt ?? null,
				expiresAt: verificationRequest.expiresAt ?? null,
				revokedAt: verificationRequest.revokedAt ?? null,
				documents: documents.docs.map((doc) => documentMeta(doc)),
			},
			shop: {
				id: String(shop.id),
				handle: shop.handle,
				name: shop.name,
				status: shop.status,
				level: shop.level ?? null,
			},
			owner: owner
				? {
						id: String(owner.id),
						name: owner.name ?? null,
						email: owner.email,
						role: owner.role,
						identityVerifiedAt: owner.identityVerifiedAt ?? null,
					}
				: null,
			otherRequests: otherRequests.docs.map((doc) => ({
				id: String(doc.id),
				requestedLevel: doc.requestedLevel,
				status: doc.status,
				submittedAt: doc.submittedAt ?? null,
			})),
			log: log.docs,
			viewer: {
				canClaim:
					!conflictOfInterest &&
					rankOk &&
					canTransition("claim", verificationRequest.status),
				canDecide: isAssignee && !conflictOfInterest,
				isAssignee,
				isAdmin: isAdmin(ctx.actor),
				conflictOfInterest,
			},
		});
	} catch (error) {
		return handleModerationError("verification:detail", error);
	}
}

const BODY_SCHEMA = z.object({
	action: z.enum([
		"claim",
		"release",
		"request_info",
		"approve",
		"reject",
		"revoke",
	]),
	force: z.boolean().optional(),
	reasonCode: z.string().optional(),
	sellerMessage: z.string().optional(),
	note: z.string().optional(),
	checklist: z.record(z.string(), z.boolean()).optional(),
});

type DecisionBody = z.infer<typeof BODY_SCHEMA>;

const ACTIONS: Record<
	DecisionBody["action"],
	(
		ctx: ModerationContext,
		id: string,
		body: DecisionBody,
	) => Promise<VerificationRequest>
> = {
	claim: (ctx, id, body) =>
		claimRequest(ctx.payload, ctx.actor, id, { force: body.force === true }),
	release: (ctx, id) => releaseRequest(ctx.payload, ctx.actor, id),
	request_info: (ctx, id, body) =>
		requestInfo(ctx.payload, ctx.actor, id, {
			reasonCode: body.reasonCode ?? "",
			message: body.sellerMessage ?? "",
		}),
	approve: (ctx, id, body) =>
		approveRequest(ctx.payload, ctx.actor, id, {
			note: body.note ?? null,
			checklist: body.checklist,
		}),
	reject: (ctx, id, body) =>
		rejectRequest(ctx.payload, ctx.actor, id, {
			reasonCode: body.reasonCode ?? "",
			sellerMessage: body.sellerMessage ?? "",
			note: body.note ?? null,
		}),
	revoke: (ctx, id, body) =>
		revokeRequest(ctx.payload, ctx.actor, id, {
			reasonCode: body.reasonCode ?? "",
			note: body.note ?? null,
		}),
};

/**
 * Dispatches on `action`. Never consults the verification feature flag: a
 * review already in flight must finish while intake is paused (Task 15's
 * rule, applied here too).
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	const { id } = await params;
	const body = await readJson(request);
	const parsed = BODY_SCHEMA.safeParse(body);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	// A takeover of someone else's claim is an administrator's call, checked
	// before the service is ever reached rather than left to fail downstream.
	if (
		parsed.data.action === "claim" &&
		parsed.data.force === true &&
		!isAdmin(ctx.actor)
	) {
		return errorResponse(ERROR_CODES.moderationForbidden, 403);
	}

	try {
		const updated = await ACTIONS[parsed.data.action](ctx, id, parsed.data);
		return Response.json({ request: updated });
	} catch (error) {
		return handleVerificationError("verification:decision", error);
	}
}
