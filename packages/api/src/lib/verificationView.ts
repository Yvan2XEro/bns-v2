import type { Payload } from "payload";
import type { DocumentKind } from "../collections/VerificationDocuments";
import {
	type BusinessType,
	OPEN_STATUSES,
	type VerificationStatus,
} from "../collections/VerificationRequests";
import type {
	Shop,
	VerificationDocument,
	VerificationRequest,
} from "../payload-types";
import { cooldownUntil, RENEWABLE_DAYS_BEFORE } from "../services/verification";
import { ERROR_CODES } from "./errors";
import { relationId } from "./relationId";
import { ServiceError } from "./serviceError";
import {
	CAPABILITY_UNLOCKS,
	type ShopCapabilities,
	shopCapabilities,
} from "./shopCapabilities";
import { getVerificationSettings } from "./verificationSettings";

/** The owner's view of a request. Reviewer-only fields are absent, not null. */
export interface OwnerVerificationRequest {
	id: string;
	requestedLevel: 2 | 3;
	status: VerificationStatus;
	consent: { acceptedAt: string; version: string; locale: "fr" | "en" } | null;
	kyc: {
		status:
			| "not_started"
			| "pending"
			| "approved"
			| "declined"
			| "review"
			| "abandoned"
			| "error";
		attempts: number;
		documentType: "national_id" | "passport" | "residence_permit" | null;
		documentCountry: string | null;
		documentNumberLast4: string | null;
		documentExpiresAt: string | null;
		givenNames: string | null;
		familyName: string | null;
		livenessPassed: boolean;
	} | null;
	business: {
		businessType: BusinessType | null;
		legalName: string | null;
		tradeName: string | null;
		rccmNumber: string | null;
		entreprenantDeclarationNumber: string | null;
		niu: string | null;
		registeredAddress: string | null;
		city: string | null;
		legalRepresentativeName: string | null;
		legalRepresentativeIsOwner: boolean;
	} | null;
	documents: {
		id: string;
		kind: DocumentKind;
		originalFilename: string;
		mimeType: string;
		filesize: number;
		createdAt: string;
	}[];
	infoRequests: {
		reasonCode: string;
		message: string;
		requestedAt: string;
		respondedAt: string | null;
	}[];
	decision: {
		decidedAt: string;
		reasonCode: string | null;
		sellerMessage: string | null;
	} | null;
	statusHistory: {
		status: VerificationStatus;
		at: string;
		source: "seller" | "reviewer" | "vendor" | "system";
	}[];
	submittedAt: string | null;
	approvedAt: string | null;
	expiresAt: string | null;
}

/** GET /api/shops/{id}/verification */
export interface ShopVerificationResponse {
	enabled: boolean;
	capabilities: ShopCapabilities;
	levelExpiresAt: string | null;
	consentVersion: string | null;
	requests: {
		level2: OwnerVerificationRequest | null;
		level3: OwnerVerificationRequest | null;
	};
	renewableFrom: { level2: string | null; level3: string | null };
	nextLevel: {
		level: 2 | 3;
		unlocks: Array<keyof ShopCapabilities>;
		eligible: boolean;
	} | null;
	cooldownUntil: string | null;
}

/**
 * This must agree with the field-level `read` rules on the collection, which
 * is what Payload's own REST route enforces. Both are tested against each
 * other in verification-seller-routes.int.spec.ts.
 */
export function toOwnerRequest(
	request: VerificationRequest,
	documents: VerificationDocument[],
): OwnerVerificationRequest {
	const consent = request.consent;
	const kyc = request.kyc;
	const business = request.business;

	return {
		id: String(request.id),
		requestedLevel: request.requestedLevel === 3 ? 3 : 2,
		status: request.status,
		consent:
			consent?.acceptedAt && consent.version
				? {
						acceptedAt: consent.acceptedAt,
						version: consent.version,
						locale: consent.locale === "en" ? "en" : "fr",
					}
				: null,
		kyc:
			request.requestedLevel === 2
				? {
						status: kyc?.status ?? "not_started",
						attempts: kyc?.attempts ?? 0,
						documentType: kyc?.documentType ?? null,
						documentCountry: kyc?.documentCountry ?? null,
						documentNumberLast4: kyc?.documentNumberLast4 ?? null,
						documentExpiresAt: kyc?.documentExpiresAt ?? null,
						givenNames: kyc?.givenNames ?? null,
						familyName: kyc?.familyName ?? null,
						livenessPassed: kyc?.livenessPassed ?? false,
					}
				: null,
		business:
			request.requestedLevel === 3
				? {
						businessType: business?.businessType ?? null,
						legalName: business?.legalName ?? null,
						tradeName: business?.tradeName ?? null,
						rccmNumber: business?.rccmNumber ?? null,
						entreprenantDeclarationNumber:
							business?.entreprenantDeclarationNumber ?? null,
						niu: business?.niu ?? null,
						registeredAddress: business?.registeredAddress ?? null,
						city: business?.city ?? null,
						legalRepresentativeName: business?.legalRepresentativeName ?? null,
						legalRepresentativeIsOwner:
							business?.legalRepresentativeIsOwner ?? true,
					}
				: null,
		documents: documents.map((document) => ({
			id: String(document.id),
			kind: document.kind,
			originalFilename: document.originalFilename ?? "",
			mimeType: document.mimeType ?? "",
			filesize: document.filesize ?? 0,
			createdAt: document.createdAt,
		})),
		infoRequests: (request.infoRequests ?? []).map((entry) => ({
			reasonCode: entry.reasonCode,
			message: entry.message,
			requestedAt: entry.requestedAt,
			respondedAt: entry.respondedAt ?? null,
		})),
		decision: request.decision?.decidedAt
			? {
					decidedAt: request.decision.decidedAt,
					reasonCode: request.decision.reasonCode ?? null,
					sellerMessage: request.decision.sellerMessage ?? null,
				}
			: null,
		statusHistory: (request.statusHistory ?? []).map((entry) => ({
			status: entry.status,
			at: entry.at,
			source: entry.source,
		})),
		submittedAt: request.submittedAt ?? null,
		approvedAt: request.approvedAt ?? null,
		expiresAt: request.expiresAt ?? null,
	};
}

/** Loads a request and refuses anyone but the seller who submitted it. */
export async function loadOwnedRequest(
	payload: Payload,
	actorId: string,
	requestId: string,
): Promise<VerificationRequest> {
	let request: VerificationRequest;
	try {
		request = await payload.findByID({
			collection: "verification-requests",
			id: requestId,
			depth: 0,
			overrideAccess: true,
		});
	} catch {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
	if (relationId(request.submittedBy) !== actorId) {
		throw new ServiceError(ERROR_CODES.verificationNotOwner, 403);
	}
	return request;
}

/** Every document currently attached to a request, queried directly rather
 * than through the `documents` join — see services/verificationDocuments.ts. */
export async function documentsFor(
	payload: Payload,
	requestId: string,
): Promise<VerificationDocument[]> {
	const found = await payload.find({
		collection: "verification-documents",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		where: { request: { equals: requestId } },
	});
	return found.docs;
}

const DECIDED_STATUSES = [
	"approved",
	"rejected",
	"revoked",
	"expired",
] as const;

/**
 * The request an owner cares about for a level: the one still open if any
 * (there is at most one, enforced by `openKey`'s unique index), otherwise the
 * most recent decision — so a seller mid-review, or one who was just
 * rejected, keeps seeing where they stand.
 */
async function currentRequestFor(
	payload: Payload,
	shopId: string,
	level: 2 | 3,
): Promise<VerificationRequest | null> {
	const open = await payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ requestedLevel: { equals: level } },
				{ status: { in: [...OPEN_STATUSES] } },
			],
		},
	});
	if (open.docs[0]) return open.docs[0];

	const decided = await payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		sort: "-createdAt",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ requestedLevel: { equals: level } },
				{ status: { in: [...DECIDED_STATUSES] } },
			],
		},
	});
	return decided.docs[0] ?? null;
}

/** The currently backing approval for a level: approved and not yet expired. */
async function approvedActiveRequest(
	payload: Payload,
	shopId: string,
	level: 2 | 3,
	now: Date,
): Promise<VerificationRequest | null> {
	const found = await payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ requestedLevel: { equals: level } },
				{ status: { equals: "approved" } },
			],
		},
	});
	return (
		found.docs.find(
			(candidate) =>
				candidate.expiresAt &&
				Date.parse(String(candidate.expiresAt)) > now.getTime(),
		) ?? null
	);
}

function nextLevelFor(
	capabilities: ShopCapabilities,
): ShopVerificationResponse["nextLevel"] {
	if (capabilities.effectiveLevel >= 3) return null;
	const level: 2 | 3 = capabilities.effectiveLevel >= 2 ? 3 : 2;
	const eligible =
		level === 2
			? capabilities.effectiveLevel >= 1
			: capabilities.effectiveLevel >= 2;
	return { level, unlocks: CAPABILITY_UNLOCKS[level], eligible };
}

/**
 * Assembles the `ShopVerificationResponse` a seller sees. `enabled` reports
 * the feature flag rather than being gated by it: a request already in
 * flight must stay visible while the flag is off.
 */
export async function getShopVerificationView(
	payload: Payload,
	shop: Shop,
	now = new Date(),
): Promise<ShopVerificationResponse> {
	const shopId = String(shop.id);
	const settings = await getVerificationSettings(payload);
	const capabilities = shopCapabilities(shop, now);

	const [level2Request, level3Request] = await Promise.all([
		currentRequestFor(payload, shopId, 2),
		currentRequestFor(payload, shopId, 3),
	]);
	const [level2Documents, level3Documents] = await Promise.all([
		level2Request ? documentsFor(payload, String(level2Request.id)) : [],
		level3Request ? documentsFor(payload, String(level3Request.id)) : [],
	]);

	const [level2Active, level3Active] = await Promise.all([
		approvedActiveRequest(payload, shopId, 2, now),
		approvedActiveRequest(payload, shopId, 3, now),
	]);
	const renewableFrom = {
		level2: level2Active?.expiresAt
			? new Date(
					Date.parse(String(level2Active.expiresAt)) -
						RENEWABLE_DAYS_BEFORE * 86_400_000,
				).toISOString()
			: null,
		level3: level3Active?.expiresAt
			? new Date(
					Date.parse(String(level3Active.expiresAt)) -
						RENEWABLE_DAYS_BEFORE * 86_400_000,
				).toISOString()
			: null,
	};

	const nextLevel = nextLevelFor(capabilities);
	const nextLevelCurrent = nextLevel
		? nextLevel.level === 2
			? level2Request
			: level3Request
		: null;
	const cooldown =
		nextLevelCurrent?.status === "rejected" &&
		nextLevelCurrent.decision?.decidedAt
			? cooldownUntil({
					decidedAt: String(nextLevelCurrent.decision.decidedAt),
					reasonCode: nextLevelCurrent.decision.reasonCode ?? null,
				})
			: null;

	return {
		enabled: settings.enabled,
		capabilities,
		levelExpiresAt: shop.levelExpiresAt ?? null,
		consentVersion: settings.consentVersion,
		requests: {
			level2: level2Request
				? toOwnerRequest(level2Request, level2Documents)
				: null,
			level3: level3Request
				? toOwnerRequest(level3Request, level3Documents)
				: null,
		},
		renewableFrom,
		nextLevel,
		cooldownUntil:
			cooldown && cooldown.getTime() > now.getTime()
				? cooldown.toISOString()
				: null,
	};
}
