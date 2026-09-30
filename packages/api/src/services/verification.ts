import type { Payload, PayloadRequest, Where } from "payload";
import { canActOn, isAdmin } from "../access/roles";
import type { ModerationAction } from "../collections/ModerationLog";
import { LEVEL3_CHECKLIST_ITEMS } from "../collections/VerificationRequests";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import { getKycProvider } from "../lib/kyc";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { CAPABILITY_UNLOCKS, shopCapabilities } from "../lib/shopCapabilities";
import { withTransaction } from "../lib/transactions";
import { getVerificationSettings } from "../lib/verificationSettings";
import {
	computeSignals,
	type ReviewSignal,
	type SignalInput,
} from "../lib/verificationSignals";
import {
	canTransition,
	isOpen,
	logActionFor,
	nextStatus,
	TRANSITIONS,
	type TransitionName,
	type TransitionSource,
} from "../lib/verificationTransitions";
import type { Shop, User, VerificationRequest } from "../payload-types";
import {
	isUniqueViolation,
	type LevelCause,
	type ServiceUser,
	writeShop,
} from "./shops";
import { recomputeShopLevel } from "./verificationLevel";
import {
	notifyVerificationApproved,
	notifyVerificationNeedsInfo,
	notifyVerificationRejected,
	notifyVerificationRevoked,
} from "./verificationNotifications";

/**
 * Three flags, because one transition touches three guarded surfaces:
 * `verificationService` for the request rows and the user's identity fields,
 * `shopService` for `shops.level` and friends, `moderationAction` for the log.
 */
export const VERIFICATION_CONTEXT = {
	verificationService: true,
	shopService: true,
	moderationAction: true,
} as const;

const COOLDOWN_HOURS = 24;
const FRAUD_COOLDOWN_DAYS = 7;
const LEVEL_VALIDITY_MONTHS = 24;
export const RENEWABLE_DAYS_BEFORE = 60;

function addMonths(date: Date, months: number): Date {
	const out = new Date(date.getTime());
	out.setUTCMonth(out.getUTCMonth() + months);
	return out;
}

/**
 * Level 2 is worth nothing past the identity document's own expiry, so the
 * earlier of the two wins — including when the document has already expired,
 * which yields a date in the past and therefore an effective level of 1 the
 * moment `shopCapabilities` looks. That is the correct answer: a reviewer who
 * approves an expired document grants nothing rather than granting 24 months.
 */
export function expiryFor(
	level: 2 | 3,
	approvedAt: Date,
	documentExpiresAt?: Date | null,
): Date {
	const standard = addMonths(approvedAt, LEVEL_VALIDITY_MONTHS);
	if (level === 3 || !documentExpiresAt) return standard;
	return documentExpiresAt.getTime() < standard.getTime()
		? documentExpiresAt
		: standard;
}

export function cooldownUntil(
	lastRejection: { decidedAt: string; reasonCode: string | null } | null,
): Date | null {
	if (!lastRejection?.decidedAt) return null;
	const at = new Date(lastRejection.decidedAt);
	return lastRejection.reasonCode === "fraud_suspected"
		? new Date(at.getTime() + FRAUD_COOLDOWN_DAYS * 86_400_000)
		: new Date(at.getTime() + COOLDOWN_HOURS * 3_600_000);
}

function error(code: ErrorCode, status: number): ServiceError {
	return new ServiceError(code, status);
}

function cleanText(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The action every transition name logs under, or a loud failure if one is missing. */
function requiredLogAction(name: TransitionName): ModerationAction {
	const action = logActionFor(name);
	if (!action) {
		throw new Error(`[verification] transition "${name}" has no log action`);
	}
	return action;
}

/**
 * `db.updateOne`'s real adapter types its result as an untyped `Document`, so
 * the row this narrows is the authoritative post-write state (see
 * `services/stock.ts`'s `isVariantRow` for the same pattern).
 */
function isVerificationRequestRow(row: unknown): row is VerificationRequest {
	if (typeof row !== "object" || row === null) return false;
	return "id" in row && "status" in row && "requestedLevel" in row;
}

async function loadShop(req: PayloadRequest, shopId: string): Promise<Shop> {
	try {
		return await req.payload.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
			req,
		});
	} catch {
		throw error(ERROR_CODES.shopNotFound, 404);
	}
}

async function loadRequest(
	req: PayloadRequest,
	requestId: string,
): Promise<VerificationRequest> {
	try {
		return await req.payload.findByID({
			collection: "verification-requests",
			id: requestId,
			depth: 0,
			overrideAccess: true,
			req,
		});
	} catch {
		throw error(ERROR_CODES.notFound, 404);
	}
}

async function loadUser(req: PayloadRequest, userId: string): Promise<User> {
	try {
		return await req.payload.findByID({
			collection: "users",
			id: userId,
			depth: 0,
			overrideAccess: true,
			req,
		});
	} catch {
		throw error(ERROR_CODES.notFound, 404);
	}
}

async function findByOpenKey(
	req: PayloadRequest,
	openKey: string,
): Promise<VerificationRequest | null> {
	const found = await req.payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		req,
		where: { openKey: { equals: openKey } },
	});
	return found.docs[0] ?? null;
}

async function findApproved(
	req: PayloadRequest,
	shopId: string,
	level: 2 | 3,
): Promise<VerificationRequest | null> {
	const found = await req.payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		req,
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ requestedLevel: { equals: level } },
				{ status: { equals: "approved" } },
			],
		},
	});
	return found.docs[0] ?? null;
}

/** The most recent decided rejection for this shop and level, if any is still within its cooldown. */
async function lastRejectionCooldown(
	req: PayloadRequest,
	shopId: string,
	level: 2 | 3,
): Promise<Date | null> {
	const found = await req.payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ requestedLevel: { equals: level } },
				{ status: { equals: "rejected" } },
			],
		},
	});

	let latest: VerificationRequest | null = null;
	for (const candidate of found.docs) {
		if (!candidate.decision?.decidedAt) continue;
		if (!latest?.decision?.decidedAt) {
			latest = candidate;
			continue;
		}
		if (
			Date.parse(String(candidate.decision.decidedAt)) >
			Date.parse(String(latest.decision.decidedAt))
		) {
			latest = candidate;
		}
	}
	const decidedAt = latest?.decision?.decidedAt;
	if (!decidedAt) return null;
	return cooldownUntil({
		decidedAt: String(decidedAt),
		reasonCode: latest?.decision?.reasonCode ?? null,
	});
}

/**
 * A reviewer who owns the shop, or holds any `shop-members` row in it, cannot
 * review it. Checked on claim, and again on every decision: a membership can
 * be created after the claim.
 */
async function assertNoConflict(
	req: PayloadRequest,
	actorId: string,
	shop: Shop,
): Promise<void> {
	if (relationId(shop.owner) === actorId) {
		throw error(ERROR_CODES.verificationConflictOfInterest, 403);
	}
	const membership = await req.payload.find({
		collection: "shop-members",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		req,
		where: {
			and: [{ shop: { equals: shop.id } }, { user: { equals: actorId } }],
		},
	});
	if (membership.docs.length > 0) {
		throw error(ERROR_CODES.verificationConflictOfInterest, 403);
	}
}

/** Claim and revoke: no assignee yet (or none any more) to check against, only rank. */
async function assertCanReview(
	req: PayloadRequest,
	actor: ServiceUser,
	shop: Shop,
): Promise<void> {
	await assertNoConflict(req, actor.id, shop);
	const owner = await loadUser(req, relationId(shop.owner) ?? "");
	if (!canActOn(actor, owner)) {
		throw error(ERROR_CODES.moderationRankTooLow, 403);
	}
}

/** Approve, reject, request-info: only the reviewer who is currently holding the claim may decide. */
async function assertReviewer(
	req: PayloadRequest,
	actor: ServiceUser,
	request: VerificationRequest,
	shop: Shop,
): Promise<void> {
	await assertNoConflict(req, actor.id, shop);
	if (relationId(request.assignee) !== actor.id) {
		throw error(ERROR_CODES.verificationNotAssignee, 403);
	}
}

/** The one place a status changes. Refuses anything the table does not list. */
async function transition(
	req: PayloadRequest,
	request: VerificationRequest,
	name: TransitionName,
	patch: Record<string, unknown>,
	source: TransitionSource,
	actorId: string | null,
): Promise<VerificationRequest> {
	if (!canTransition(name, request.status)) {
		throw error(ERROR_CODES.verificationInvalidTransition, 409);
	}
	const to = nextStatus(name);
	const at = new Date().toISOString();
	const shopId = relationId(request.shop);
	const allowedFrom = TRANSITIONS[name].from;

	// Conditioned on the current status at write time, not just at read time:
	// `db.updateOne` is the one atomic primitive available (mirrors the Mongo
	// adapter's `findOneAndUpdate`), so two racing decisions on the same
	// request can never both land — the second one's condition simply stops
	// matching and it is told the transition is no longer legal.
	const where: Where = {
		and: [{ id: { equals: request.id } }, { status: { in: [...allowedFrom] } }],
	};
	const data: Record<string, unknown> = {
		...patch,
		status: to,
		openKey:
			isOpen(to) && shopId ? `${shopId}:${request.requestedLevel}` : null,
		statusHistory: [
			...(request.statusHistory ?? []),
			{ status: to, at, actor: actorId, source },
		],
	};

	const updatedRow: unknown = await req.payload.db.updateOne({
		collection: "verification-requests",
		where,
		data,
		req,
	});
	if (!isVerificationRequestRow(updatedRow)) {
		throw error(ERROR_CODES.verificationInvalidTransition, 409);
	}
	return updatedRow;
}

/**
 * Gathers the candidates a fresh signal computation needs: other live
 * requests sharing an identity hash, an RCCM number or a NIU, and any
 * document this request carries that was already uploaded on another shop.
 * One coarse `find` per axis, narrowed by whatever the request already has —
 * `computeSignals` does the exact, normalised comparison over whatever comes
 * back.
 *
 * `overrides.kyc` lets a caller supply a KYC outcome that has not been
 * written to the row yet (`processKycEvent` computes signals from the
 * vendor's fresh result before it decides how to persist it).
 */
export async function computeReviewSignals(
	req: PayloadRequest,
	request: VerificationRequest,
	overrides: { kyc?: SignalInput["kyc"] } = {},
): Promise<ReviewSignal[]> {
	const shopId = relationId(request.shop) ?? "";
	const ownerId = relationId(request.submittedBy) ?? undefined;
	const owner = ownerId ? await loadUser(req, ownerId).catch(() => null) : null;

	const kyc: SignalInput["kyc"] =
		overrides.kyc !== undefined
			? overrides.kyc
			: request.kyc?.status
				? {
						status: request.kyc.status,
						givenNames: request.kyc.givenNames ?? null,
						familyName: request.kyc.familyName ?? null,
						adult: request.kyc.adult ?? false,
						documentNumberHash: request.kyc.documentNumberHash ?? null,
					}
				: null;

	const business: SignalInput["business"] = request.business?.businessType
		? {
				rccmNumber: request.business.rccmNumber ?? null,
				niu: request.business.niu ?? null,
			}
		: null;

	const orClauses: Where[] = [];
	if (kyc?.documentNumberHash) {
		orClauses.push({
			"kyc.documentNumberHash": { equals: kyc.documentNumberHash },
		});
	}
	if (business?.rccmNumber) {
		orClauses.push({ "business.rccmNumber": { equals: business.rccmNumber } });
	}
	if (business?.niu) {
		orClauses.push({ "business.niu": { equals: business.niu } });
	}

	let otherRequests: SignalInput["otherRequests"] = [];
	if (orClauses.length > 0) {
		const found = await req.payload.find({
			collection: "verification-requests",
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
			req,
			where: { and: [{ id: { not_equals: request.id } }, { or: orClauses }] },
		});
		otherRequests = found.docs.map((doc) => ({
			id: String(doc.id),
			shopId: relationId(doc.shop) ?? "",
			submittedById: relationId(doc.submittedBy) ?? "",
			status: String(doc.status),
			documentNumberHash: doc.kyc?.documentNumberHash ?? null,
			rccmNumber: doc.business?.rccmNumber ?? null,
			niu: doc.business?.niu ?? null,
		}));
	}

	const myDocuments = await req.payload.find({
		collection: "verification-documents",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: { request: { equals: request.id } },
	});
	const foreignIds = new Set<string>();
	for (const doc of myDocuments.docs) {
		const duplicateOf = doc.duplicateOf as unknown[] | undefined;
		for (const id of duplicateOf ?? []) {
			const foreignId = relationId(id);
			if (foreignId) foreignIds.add(foreignId);
		}
	}
	let documentDuplicates: SignalInput["documentDuplicates"] = [];
	if (foreignIds.size > 0) {
		const foreignDocs = await req.payload.find({
			collection: "verification-documents",
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
			req,
			where: { id: { in: [...foreignIds] } },
		});
		documentDuplicates = foreignDocs.docs.map((doc) => ({
			documentId: String(doc.id),
			shopId: relationId(doc.shop) ?? "",
		}));
	}

	return computeSignals({
		ownerId,
		ownerName: owner?.name ?? "",
		shopId,
		kyc,
		business,
		documentDuplicates,
		otherRequests,
	});
}

/** Recomputes and writes `reviewSignals` for a request whose own fields are already current on the row. */
async function refreshSignals(
	req: PayloadRequest,
	request: VerificationRequest,
): Promise<VerificationRequest> {
	const reviewSignals = await computeReviewSignals(req, request);
	return req.payload.update({
		collection: "verification-requests",
		id: request.id,
		req,
		overrideAccess: true,
		context: VERIFICATION_CONTEXT,
		data: { reviewSignals } as never,
	});
}

async function writeLog(
	req: PayloadRequest,
	input: {
		action: ModerationAction;
		targetId: string;
		actor: { id: string; role?: string | null } | null;
		reason?: string | null;
		note?: string | null;
		metadata?: Record<string, unknown>;
	},
): Promise<void> {
	await req.payload.create({
		collection: "moderation-log",
		req,
		overrideAccess: true,
		context: VERIFICATION_CONTEXT,
		data: {
			actor: input.actor?.id ?? null,
			actorRole: input.actor?.role ?? "system",
			action: input.action,
			targetType: "verification-request",
			targetId: input.targetId,
			reason: input.reason ?? undefined,
			note: input.note ?? undefined,
			metadata: input.metadata ?? undefined,
		},
	});
}

/**
 * Copies the reviewed legal block onto the shop, the moment a level-3 request
 * is approved — `legal` is otherwise the seller's own declaration.
 */
async function writeShopLegal(
	req: PayloadRequest,
	shopId: string,
	request: VerificationRequest,
	approvedAt: Date,
): Promise<void> {
	const business = request.business ?? {};
	await writeShop(req, shopId, {
		legal: {
			businessType: business.businessType ?? null,
			legalName: business.legalName ?? null,
			rccmNumber: business.rccmNumber ?? null,
			niu: business.niu ?? null,
			verifiedAt: approvedAt.toISOString(),
		},
	});
}

/**
 * The business field group only — required document *kinds* per business
 * type live in `services/verificationDocuments.ts` (Task 12) and are not
 * re-checked here: the pinned resubmission flow answers a reviewer's
 * information request with zero documents attached, and a request already
 * past its first submission is not re-litigated on field completeness alone.
 */
function assertBusinessValid(request: VerificationRequest): void {
	const business = request.business;
	if (!business?.businessType) {
		throw error(ERROR_CODES.verificationFieldsInvalid, 400);
	}
	const registrationNumber =
		business.businessType === "entreprenant"
			? business.entreprenantDeclarationNumber
			: business.rccmNumber;
	const required = [
		business.legalName,
		business.registeredAddress,
		business.city,
		business.legalRepresentativeName,
		business.niu,
		registrationNumber,
	];
	if (required.some((value) => !cleanText(value))) {
		throw error(ERROR_CODES.verificationFieldsInvalid, 400);
	}
}

export async function openRequest(
	payload: Payload,
	actor: ServiceUser,
	shopId: string,
	level: 2 | 3,
): Promise<VerificationRequest> {
	const settings = await getVerificationSettings(payload);
	if (!settings.enabled) {
		throw error(ERROR_CODES.verificationDisabled, 403);
	}

	return withTransaction(
		payload,
		async (req) => {
			const shop = await loadShop(req, shopId);
			if (relationId(shop.owner) !== actor.id) {
				throw error(ERROR_CODES.verificationNotOwner, 403);
			}
			if (shop.status !== "active") {
				throw error(ERROR_CODES.shopInactive, 409);
			}
			if (level === 3 && shopCapabilities(shop).effectiveLevel < 2) {
				throw error(ERROR_CODES.verificationLevelNotEligible, 409);
			}

			const cooldown = await lastRejectionCooldown(req, shopId, level);
			if (cooldown && cooldown.getTime() > Date.now()) {
				throw error(ERROR_CODES.verificationCooldown, 429);
			}

			const openKey = `${shopId}:${level}`;
			const existing = await findByOpenKey(req, openKey);
			if (existing) return existing;

			let created: VerificationRequest;
			try {
				created = await req.payload.create({
					collection: "verification-requests",
					req,
					overrideAccess: true,
					context: VERIFICATION_CONTEXT,
					data: {
						shop: shopId,
						requestedLevel: level,
						submittedBy: actor.id,
						status: "draft",
						openKey,
						statusHistory: [
							{
								status: "draft",
								at: new Date().toISOString(),
								actor: actor.id,
								source: "seller",
							},
						],
					},
				});
			} catch (raised) {
				// Lost the race for this shop+level slot to another request that
				// committed first: that request is the answer, not the error.
				if (isUniqueViolation(raised)) {
					const winner = await findByOpenKey(req, openKey);
					if (winner) return winner;
				}
				throw raised;
			}

			await recomputeShopLevel(req, shopId, "manual");
			return created;
		},
		{ user: actor },
	);
}

export async function submitRequest(
	payload: Payload,
	actor: ServiceUser,
	requestId: string,
): Promise<VerificationRequest> {
	return withTransaction(
		payload,
		async (req) => {
			const request = await loadRequest(req, requestId);
			if (relationId(request.submittedBy) !== actor.id) {
				throw error(ERROR_CODES.verificationNotOwner, 403);
			}
			if (request.requestedLevel === 3) {
				assertBusinessValid(request);
			}

			const isResubmit = request.status === "needs_info";
			const name: TransitionName = isResubmit ? "resubmit" : "submit";
			const now = new Date().toISOString();
			const patch: Record<string, unknown> = { submittedAt: now };
			if (isResubmit) {
				patch.infoRequests = (request.infoRequests ?? []).map((entry) =>
					entry.respondedAt ? entry : { ...entry, respondedAt: now },
				);
			}

			const updated = await transition(
				req,
				request,
				name,
				patch,
				"seller",
				actor.id,
			);
			await recomputeShopLevel(req, relationId(updated.shop) ?? "", "manual");
			return updated.requestedLevel === 3
				? await refreshSignals(req, updated)
				: updated;
		},
		{ user: actor },
	);
}

export async function claimRequest(
	payload: Payload,
	actor: ServiceUser,
	requestId: string,
	options: { force?: boolean } = {},
): Promise<VerificationRequest> {
	return withTransaction(
		payload,
		async (req) => {
			let request = await loadRequest(req, requestId);
			const shopId = relationId(request.shop) ?? "";
			const shop = await loadShop(req, shopId);
			await assertCanReview(req, actor, shop);

			if (request.status === "in_review" && options.force && isAdmin(actor)) {
				const forcedFrom = relationId(request.assignee);
				request = await transition(
					req,
					request,
					"release",
					{ assignee: null, claimedAt: null },
					"reviewer",
					forcedFrom,
				);
				await writeLog(req, {
					action: requiredLogAction("release"),
					targetId: String(request.id),
					actor: forcedFrom ? { id: forcedFrom, role: "moderator" } : null,
					metadata: { forcedBy: actor.id },
				});
			}

			const updated = await transition(
				req,
				request,
				"claim",
				{ assignee: actor.id, claimedAt: new Date().toISOString() },
				"reviewer",
				actor.id,
			);
			await writeLog(req, {
				action: requiredLogAction("claim"),
				targetId: String(updated.id),
				actor: { id: actor.id, role: actor.role ?? "moderator" },
			});
			await recomputeShopLevel(req, shopId, "manual");
			return updated;
		},
		{ user: actor },
	);
}

export async function releaseRequest(
	payload: Payload,
	actor: ServiceUser,
	requestId: string,
	options: { system?: boolean } = {},
): Promise<VerificationRequest> {
	return withTransaction(
		payload,
		async (req) => {
			const request = await loadRequest(req, requestId);
			if (!options.system) {
				const isAssignee = relationId(request.assignee) === actor.id;
				if (!isAssignee && !isAdmin(actor)) {
					throw error(ERROR_CODES.verificationNotAssignee, 403);
				}
			}
			const shopId = relationId(request.shop) ?? "";

			const updated = await transition(
				req,
				request,
				"release",
				{ assignee: null, claimedAt: null },
				options.system ? "system" : "reviewer",
				options.system ? null : actor.id,
			);
			await writeLog(req, {
				action: requiredLogAction("release"),
				targetId: String(updated.id),
				actor: options.system
					? null
					: { id: actor.id, role: actor.role ?? "moderator" },
			});
			await recomputeShopLevel(req, shopId, "manual");
			return updated;
		},
		{ user: actor },
	);
}

export async function requestInfo(
	payload: Payload,
	actor: ServiceUser,
	requestId: string,
	input: { reasonCode: string; message: string },
): Promise<VerificationRequest> {
	const reasonCode = cleanText(input.reasonCode);
	const message = cleanText(input.message);
	if (!reasonCode || !message) {
		throw error(ERROR_CODES.moderationReasonRequired, 400);
	}

	return withTransaction(
		payload,
		async (req) => {
			const request = await loadRequest(req, requestId);
			const shopId = relationId(request.shop) ?? "";
			const shop = await loadShop(req, shopId);
			await assertReviewer(req, actor, request, shop);

			const infoRequests = [
				...(request.infoRequests ?? []),
				{
					reasonCode,
					message,
					requestedBy: actor.id,
					requestedAt: new Date().toISOString(),
					respondedAt: null,
				},
			];
			const updated = await transition(
				req,
				request,
				"request_info",
				{ assignee: null, claimedAt: null, infoRequests },
				"reviewer",
				actor.id,
			);

			await writeLog(req, {
				action: requiredLogAction("request_info"),
				targetId: String(updated.id),
				actor: { id: actor.id, role: actor.role ?? "moderator" },
				reason: reasonCode,
				note: message,
			});
			await recomputeShopLevel(req, shopId, "manual");
			await notifyVerificationNeedsInfo(req, {
				subscriberId: relationId(request.submittedBy) ?? "",
				shopName: shop.name,
				reasonCode,
				message,
			});
			return updated;
		},
		{ user: actor },
	);
}

/**
 * The write core shared by a reviewer's approval and the system's automatic
 * one: superseding an older approval, computing the expiry, moving the
 * status, copying identity/legal fields onto the user or shop, and logging
 * the decision. `actor: null` is the automatic path — `writeLog` then
 * attributes the entry to `actorRole: "system"`.
 */
async function applyApproval(
	req: PayloadRequest,
	request: VerificationRequest,
	transitionName: "approve" | "auto_approve",
	actor: { id: string; role?: string | null } | null,
	input: { note?: string | null; checklist?: Record<string, boolean> } = {},
	metadataExtra: Record<string, unknown> = {},
): Promise<VerificationRequest> {
	const shopId = relationId(request.shop) ?? "";
	const shop = await loadShop(req, shopId);
	const level: 2 | 3 = request.requestedLevel === 3 ? 3 : 2;
	if (level === 3) {
		const checklist = input.checklist ?? {};
		if (!LEVEL3_CHECKLIST_ITEMS.every((item) => checklist[item] === true)) {
			throw error(ERROR_CODES.verificationChecklistIncomplete, 400);
		}
	}

	const approvedAt = new Date();
	const documentExpiresAt = request.kyc?.documentExpiresAt
		? new Date(String(request.kyc.documentExpiresAt))
		: null;
	const expiresAt = expiryFor(level, approvedAt, documentExpiresAt);

	// A renewal supersedes the approval it replaces, in the same
	// transaction: two live approvals for one shop and level would both
	// feed the level recomputation and the earlier expiry would win by
	// accident.
	const superseded = await findApproved(req, shopId, level);
	const supersedesId =
		superseded && String(superseded.id) !== String(request.id)
			? String(superseded.id)
			: null;
	if (superseded && supersedesId) {
		await transition(req, superseded, "expire", {}, "system", null);
		await writeLog(req, {
			action: requiredLogAction("expire"),
			targetId: supersedesId,
			actor: null,
			metadata: { cause: "superseded", supersededBy: String(request.id) },
		});
	}

	const updated = await transition(
		req,
		request,
		transitionName,
		{
			approvedAt: approvedAt.toISOString(),
			expiresAt: expiresAt.toISOString(),
			assignee: null,
			supersedes: supersedesId,
			decision: {
				decidedBy: actor?.id ?? null,
				decidedAt: approvedAt.toISOString(),
				reasonCode: null,
				sellerMessage: null,
				internalNote: input.note ?? null,
				checklist: input.checklist ?? null,
			},
		},
		actor ? "reviewer" : "system",
		actor?.id ?? null,
	);

	if (level === 2) {
		await req.payload.update({
			collection: "users",
			id: relationId(request.submittedBy) ?? "",
			req,
			overrideAccess: true,
			context: VERIFICATION_CONTEXT,
			data: {
				identityVerifiedAt: approvedAt.toISOString(),
				identityVerification: request.id,
			},
		});
	} else {
		await writeShopLegal(req, shopId, request, approvedAt);
	}

	await writeLog(req, {
		action: requiredLogAction(transitionName),
		targetId: String(request.id),
		actor,
		metadata: {
			level,
			expiresAt: expiresAt.toISOString(),
			supersededRequestId: supersedesId,
			...metadataExtra,
		},
	});

	await recomputeShopLevel(req, shopId, "approved");
	await notifyVerificationApproved(req, {
		subscriberId: relationId(request.submittedBy) ?? "",
		shopName: shop.name,
		level,
		unlocks: CAPABILITY_UNLOCKS[level],
	});
	return updated;
}

export async function approveRequest(
	payload: Payload,
	actor: ServiceUser,
	requestId: string,
	input: { note?: string | null; checklist?: Record<string, boolean> } = {},
): Promise<VerificationRequest> {
	return withTransaction(
		payload,
		async (req) => {
			const request = await loadRequest(req, requestId);
			const shopId = relationId(request.shop) ?? "";
			const shop = await loadShop(req, shopId);
			await assertReviewer(req, actor, request, shop);

			return applyApproval(
				req,
				request,
				"approve",
				{ id: actor.id, role: actor.role ?? "moderator" },
				input,
			);
		},
		{ user: actor },
	);
}

/**
 * The vendor-triggered counterpart of `approveRequest`: no reviewer, no
 * claim to hold, `submitted → approved` (`TRANSITIONS.auto_approve`) instead
 * of `in_review → approved`. Runs inside the caller's own transaction — a job
 * processing a vendor result, never its own — so it takes `req` directly
 * rather than opening one.
 */
export async function autoApprove(
	req: PayloadRequest,
	request: VerificationRequest,
): Promise<VerificationRequest> {
	return applyApproval(
		req,
		request,
		"auto_approve",
		null,
		{},
		{
			automatic: true,
		},
	);
}

/**
 * Moves a level-2 request out of `draft` on the vendor's own signal —
 * `submit`'s `from`/`to` are the same either way, only who is credited
 * differs (`source: "vendor"`, no seller action recorded). Also runs inside
 * the caller's transaction.
 */
export async function submitFromVendor(
	req: PayloadRequest,
	request: VerificationRequest,
): Promise<VerificationRequest> {
	const updated = await transition(
		req,
		request,
		"submit",
		{ submittedAt: new Date().toISOString() },
		"vendor",
		null,
	);
	await recomputeShopLevel(req, relationId(updated.shop) ?? "", "manual");
	return updated;
}

export async function rejectRequest(
	payload: Payload,
	actor: ServiceUser,
	requestId: string,
	input: { reasonCode: string; sellerMessage: string; note?: string | null },
): Promise<VerificationRequest> {
	const reasonCode = cleanText(input.reasonCode);
	const sellerMessage = cleanText(input.sellerMessage);
	if (!reasonCode || !sellerMessage) {
		throw error(ERROR_CODES.moderationReasonRequired, 400);
	}

	return withTransaction(
		payload,
		async (req) => {
			const request = await loadRequest(req, requestId);
			const shopId = relationId(request.shop) ?? "";
			const shop = await loadShop(req, shopId);
			await assertReviewer(req, actor, request, shop);

			const decidedAt = new Date().toISOString();
			const updated = await transition(
				req,
				request,
				"reject",
				{
					assignee: null,
					decision: {
						decidedBy: actor.id,
						decidedAt,
						reasonCode,
						sellerMessage,
						internalNote: input.note ?? null,
						checklist: null,
					},
				},
				"reviewer",
				actor.id,
			);

			await writeLog(req, {
				action: requiredLogAction("reject"),
				targetId: String(updated.id),
				actor: { id: actor.id, role: actor.role ?? "moderator" },
				reason: reasonCode,
				note: input.note ?? null,
			});
			// No level change from a rejection, but the recompute is cheap and
			// keeps the post-condition unconditional rather than relying on the
			// caller to know a rejection never touches the shop's level.
			await recomputeShopLevel(req, shopId, "rejected");
			await notifyVerificationRejected(req, {
				subscriberId: relationId(request.submittedBy) ?? "",
				shopName: shop.name,
				reasonCode,
				sellerMessage,
				cooldownUntil:
					cooldownUntil({ decidedAt, reasonCode })?.toISOString() ?? null,
			});
			return updated;
		},
		{ user: actor },
	);
}

export async function revokeRequest(
	payload: Payload,
	actor: ServiceUser,
	requestId: string,
	input: { reasonCode: string; note?: string | null },
): Promise<VerificationRequest> {
	const reasonCode = cleanText(input.reasonCode);
	if (!reasonCode) {
		throw error(ERROR_CODES.moderationReasonRequired, 400);
	}

	return withTransaction(
		payload,
		async (req) => {
			const request = await loadRequest(req, requestId);
			const shopId = relationId(request.shop) ?? "";
			const shop = await loadShop(req, shopId);
			await assertCanReview(req, actor, shop);

			const decidedAt = new Date().toISOString();
			const updated = await transition(
				req,
				request,
				"revoke",
				{
					assignee: null,
					revokedAt: decidedAt,
					decision: {
						decidedBy: actor.id,
						decidedAt,
						reasonCode,
						sellerMessage: null,
						internalNote: input.note ?? null,
						checklist: null,
					},
				},
				"reviewer",
				actor.id,
			);

			// A level-2 revocation invalidates whatever level 3 was built on top
			// of it; a level-3 revocation stands alone.
			const cascadedRequestIds: string[] = [];
			if (request.requestedLevel === 2) {
				const level3s = await req.payload.find({
					collection: "verification-requests",
					depth: 0,
					limit: 0,
					pagination: false,
					overrideAccess: true,
					req,
					where: {
						and: [
							{ shop: { equals: shopId } },
							{ requestedLevel: { equals: 3 } },
							{ status: { equals: "approved" } },
						],
					},
				});
				for (const doc of level3s.docs) {
					const cascaded = await transition(
						req,
						doc,
						"revoke",
						{ assignee: null, revokedAt: decidedAt },
						"system",
						null,
					);
					cascadedRequestIds.push(String(cascaded.id));
				}

				await req.payload.update({
					collection: "users",
					id: relationId(request.submittedBy) ?? "",
					req,
					overrideAccess: true,
					context: VERIFICATION_CONTEXT,
					data: { identityVerifiedAt: null, identityVerification: null },
				});
			}

			await writeLog(req, {
				action: requiredLogAction("revoke"),
				targetId: String(updated.id),
				actor: { id: actor.id, role: actor.role ?? "moderator" },
				reason: reasonCode,
				note: input.note ?? null,
				metadata: { cascadedRequestIds },
			});
			await recomputeShopLevel(req, shopId, "revoked");
			await notifyVerificationRevoked(req, {
				subscriberId: relationId(request.submittedBy) ?? "",
				shopName: shop.name,
				reasonCode,
			});
			return updated;
		},
		{ user: actor },
	);
}

export async function expireRequest(
	payload: Payload,
	requestId: string,
	cause: "idle" | "no_response" | "lapsed" | "superseded" | "shop_closed",
	options: { supersededBy?: string } = {},
): Promise<VerificationRequest> {
	return withTransaction(payload, async (req) => {
		const request = await loadRequest(req, requestId);
		const shopId = relationId(request.shop) ?? "";

		const updated = await transition(
			req,
			request,
			"expire",
			{ assignee: null },
			"system",
			null,
		);

		await writeLog(req, {
			action: requiredLogAction("expire"),
			targetId: String(updated.id),
			actor: null,
			metadata: options.supersededBy
				? { cause, supersededBy: options.supersededBy }
				: { cause },
		});

		const levelCause: LevelCause =
			cause === "superseded"
				? "superseded"
				: cause === "shop_closed"
					? "shop_closed"
					: "expired";
		await recomputeShopLevel(req, shopId, levelCause);
		return updated;
	});
}

export async function deleteDraft(
	payload: Payload,
	actor: ServiceUser,
	requestId: string,
): Promise<void> {
	await withTransaction(
		payload,
		async (req) => {
			const request = await loadRequest(req, requestId);
			if (relationId(request.submittedBy) !== actor.id) {
				throw error(ERROR_CODES.verificationNotOwner, 403);
			}
			if (request.status !== "draft") {
				throw error(ERROR_CODES.verificationInvalidTransition, 409);
			}

			const documents = await req.payload.find({
				collection: "verification-documents",
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
				req,
				where: { request: { equals: requestId } },
			});
			for (const document of documents.docs) {
				await req.payload.delete({
					collection: "verification-documents",
					id: document.id,
					req,
					overrideAccess: true,
					context: VERIFICATION_CONTEXT,
				});
			}

			await req.payload.delete({
				collection: "verification-requests",
				id: requestId,
				req,
				overrideAccess: true,
				context: VERIFICATION_CONTEXT,
			});
		},
		{ user: actor },
	);
}

/**
 * Sessions started by this owner across every shop in the last 30 days,
 * counted by `kyc.attempts` rather than by row: a rate limit on the person,
 * not on any one request, so opening a fresh request per shop does not
 * reset it.
 */
async function ownerSessionsInWindow(
	req: PayloadRequest,
	ownerId: string,
	now: Date = new Date(),
): Promise<number> {
	const windowStart = new Date(now.getTime() - 30 * 86_400_000).toISOString();
	const found = await req.payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: {
			and: [
				{ submittedBy: { equals: ownerId } },
				{ requestedLevel: { equals: 2 } },
				{ createdAt: { greater_than_equal: windowStart } },
			],
		},
	});
	return found.docs.reduce(
		(sum, doc) => sum + Number(doc.kyc?.attempts ?? 0),
		0,
	);
}

export async function startKycSession(
	payload: Payload,
	actor: ServiceUser,
	requestId: string,
	input: {
		consentVersion: string;
		locale: "fr" | "en";
		/**
		 * The caller's own client. The vendor's `returnUrl` always resolves to
		 * the web return page — Didit's `callback` must be an https URL — but a
		 * mobile session needs that page to hand control back to the app, via
		 * the `app=1` marker `return-client.tsx` reads before it does anything
		 * else. Defaults to "web" for a caller that predates this field.
		 */
		platform?: "web" | "mobile";
	},
): Promise<{ url: string; expiresAt: string }> {
	return withTransaction(
		payload,
		async (req) => {
			const settings = await getVerificationSettings(payload);
			if (!settings.enabled) {
				throw error(ERROR_CODES.verificationDisabled, 403);
			}

			const request = await loadRequest(req, requestId);
			if (relationId(request.submittedBy) !== actor.id) {
				throw error(ERROR_CODES.verificationNotOwner, 403);
			}
			if (request.requestedLevel !== 2 || request.status !== "draft") {
				throw error(ERROR_CODES.verificationInvalidTransition, 409);
			}
			// The consent text and the recorded authorisation must be the same
			// version: a seller cannot consent to a notice we have since replaced.
			if (
				!settings.consentVersion ||
				input.consentVersion !== settings.consentVersion
			) {
				throw error(ERROR_CODES.verificationConsentRequired, 409);
			}

			const attempts = (request.kyc?.attempts ?? 0) + 1;
			if (attempts > 3) {
				throw error(ERROR_CODES.verificationTooManyAttempts, 429);
			}
			if ((await ownerSessionsInWindow(req, actor.id)) >= 5) {
				throw error(ERROR_CODES.verificationTooManyAttempts, 429);
			}

			const returnUrl = `${process.env.PUBLIC_WEB_URL ?? ""}/seller/verification/identity/return?request=${request.id}${
				input.platform === "mobile" ? "&app=1" : ""
			}`;
			const session = await getKycProvider(settings.kycProvider).createSession({
				reference: `VR-${request.id}-${attempts}`,
				locale: input.locale,
				returnUrl,
			});

			await req.payload.update({
				collection: "verification-requests",
				id: request.id,
				req,
				overrideAccess: true,
				context: VERIFICATION_CONTEXT,
				data: {
					consent: {
						acceptedAt: new Date().toISOString(),
						version: input.consentVersion,
						locale: input.locale,
					},
					kyc: {
						...(request.kyc ?? {}),
						provider: settings.kycProvider,
						sessionRef: session.sessionRef,
						status: "pending",
						attempts,
					},
				} as never,
			});

			// The hosted URL is not stored: it is a bearer credential for the
			// session, and it is handed to exactly one caller, once.
			return { url: session.url, expiresAt: session.expiresAt.toISOString() };
		},
		{ user: actor },
	);
}
