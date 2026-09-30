import type {
	Shop,
	User,
	VerificationRequest,
} from "../../../api/src/payload-types";

/**
 * Hand-written mirrors of the API's verification response shapes
 * (`packages/api/src/lib/shopCapabilities.ts` and `verificationView.ts`) and
 * of the reviewer queue/detail shapes served under
 * `/api/moderation/verification*`. These are not Payload collection types —
 * the API never exports them for a client to import — so they are mirrored
 * here the same way `MyShopResponse` and `PublicShop` are in
 * `src/types/shop.ts`. Sub-shapes that ARE a Payload collection field
 * (`kyc`, `business`, `consent`, `reviewSignals`) reuse the generated
 * `VerificationRequest` type instead of re-declaring them by hand.
 */

export type VerificationBadge = "phone" | "identity" | "business";

export type VerificationStatus =
	| "draft"
	| "submitted"
	| "in_review"
	| "needs_info"
	| "approved"
	| "rejected"
	| "revoked"
	| "expired";

export type BusinessType =
	| "entreprenant"
	| "sole_trader"
	| "company"
	| "cooperative";

export type DocumentKind =
	| "rccm_extract"
	| "entreprenant_declaration"
	| "niu_certificate"
	| "legal_representative_id"
	| "mandate"
	| "proof_of_address"
	| "other";

export type ReviewSignalCode =
	| "identity_reused"
	| "name_mismatch"
	| "underage"
	| "kyc_declined"
	| "kyc_review"
	| "document_reused"
	| "rccm_reused"
	| "niu_reused"
	| "niu_format";

/** Mirrors `ShopCapabilities` in `packages/api/src/lib/shopCapabilities.ts`. */
export interface ShopCapabilities {
	effectiveLevel: 0 | 1 | 2 | 3;
	badge: VerificationBadge | null;
	codOrders: boolean;
	protectedPayment: boolean;
	teamMembers: boolean;
	maxMembers: number;
	supplier: boolean;
	fasterPayouts: boolean;
	legalInfoVerified: boolean;
}

/** Mirrors `OwnerVerificationRequest` in `packages/api/src/lib/verificationView.ts`. */
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

/** `GET /api/shops/{id}/verification`. */
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

/** One row of the reviewer queue: `GET /api/moderation/verification`. */
export interface ReviewerQueueRow {
	id: string;
	shopId: string | null;
	requestedLevel: 2 | 3;
	status: VerificationStatus;
	submittedAt: string | null;
	ageMs: number | null;
	signals: string[];
	assignee: string | null;
}

export interface ReviewerQueueResponse {
	queue: string;
	total: number;
	items: ReviewerQueueRow[];
}

/** One document's metadata in the reviewer detail view — never the bytes. */
export interface ReviewerDocumentMeta {
	id: string;
	kind: DocumentKind | null;
	originalFilename: string | null;
	sha256: string | null;
	uploadedBy: string | null;
	duplicateOf: string[];
	purgedAt: string | null;
}

/** `GET /api/moderation/verification/{id}`. */
export interface ReviewerRequestDetail {
	request: {
		id: string;
		shop: string | null;
		requestedLevel: 2 | 3;
		status: VerificationStatus;
		statusHistory: NonNullable<VerificationRequest["statusHistory"]>;
		consent: VerificationRequest["consent"] | null;
		kyc: VerificationRequest["kyc"] | null;
		business: VerificationRequest["business"] | null;
		reviewSignals: NonNullable<VerificationRequest["reviewSignals"]>;
		assignee: string | null;
		claimedAt: string | null;
		infoRequests: NonNullable<VerificationRequest["infoRequests"]>;
		decision: VerificationRequest["decision"] | null;
		submittedAt: string | null;
		approvedAt: string | null;
		expiresAt: string | null;
		revokedAt: string | null;
		documents: ReviewerDocumentMeta[];
	};
	shop: {
		id: string;
		handle: string;
		name: string;
		status: Shop["status"];
		level: number | null;
	};
	owner: {
		id: string;
		name: string | null;
		email: string;
		role: User["role"];
		identityVerifiedAt: string | null;
	} | null;
	otherRequests: {
		id: string;
		requestedLevel: 2 | 3;
		status: VerificationStatus;
		submittedAt: string | null;
	}[];
	log: unknown[];
	viewer: {
		canClaim: boolean;
		canDecide: boolean;
		isAssignee: boolean;
		isAdmin: boolean;
		conflictOfInterest: boolean;
	};
}

/** `POST /api/moderation/verification/documents/{docId}/view`. */
export interface SignedDocumentUrl {
	url: string;
	expiresAt: string;
	mimeType: string;
}

const BADGE_LABEL_KEYS: Record<VerificationBadge, string> = {
	phone: "levelPhone",
	identity: "levelIdentity",
	business: "levelBusiness",
};

/** The `Shop` namespace key a badge translates under, or null for no badge. */
export function badgeLabelKey(
	badge: VerificationBadge | null | undefined,
): string | null {
	return badge ? BADGE_LABEL_KEYS[badge] : null;
}

const BADGE_BY_LEVEL: Record<number, VerificationBadge> = {
	1: "phone",
	2: "identity",
	3: "business",
};

/**
 * Derives a display badge from a shop's numeric level, for the many places
 * (search hits, cards) that only carry the public `level` number rather than
 * the full `ShopCapabilities`. This is display only — never used to decide
 * whether an action is allowed; see `canOpenRequest` for that.
 */
export function badgeForLevel(
	level: number | null | undefined,
): VerificationBadge | null {
	if (!level) return null;
	return BADGE_BY_LEVEL[level] ?? null;
}

export type LadderRungState = "reached" | "current" | "locked";

export interface LadderRung {
	level: 1 | 2 | 3;
	state: LadderRungState;
}

/** The three-rung ladder a hub screen renders, derived from `effectiveLevel`. */
export function levelLadder(capabilities: ShopCapabilities): LadderRung[] {
	return ([1, 2, 3] as const).map((level) => ({
		level,
		state:
			level < capabilities.effectiveLevel
				? "reached"
				: level === capabilities.effectiveLevel
					? "current"
					: "locked",
	}));
}

export type StatusTone = "positive" | "negative" | "warning" | "neutral";

const STATUS_TONES: Record<VerificationStatus, StatusTone> = {
	draft: "neutral",
	submitted: "neutral",
	in_review: "neutral",
	needs_info: "warning",
	approved: "positive",
	rejected: "negative",
	revoked: "negative",
	expired: "neutral",
};

/** The colour family a screen renders a request's status under. */
export function statusToneKey(status: VerificationStatus): StatusTone {
	return STATUS_TONES[status];
}

/** Mirrors `OPEN_STATUSES` in `packages/api/src/collections/VerificationRequests.ts`. */
const OPEN_STATUSES = new Set<VerificationStatus>([
	"draft",
	"submitted",
	"in_review",
	"needs_info",
]);

export type CanOpenRequestResult =
	| { ok: true }
	| { ok: false; reason: "disabled" }
	| { ok: false; reason: "notEligible" }
	| { ok: false; reason: "open" }
	| { ok: false; reason: "cooldown"; until: string }
	| { ok: false; reason: "notRenewableYet"; until: string };

/**
 * Whether a seller may open a new request for `level` right now, and why not
 * when they cannot. A discriminated result rather than a boolean: the hub
 * names the reason it refuses instead of showing a disabled button with no
 * explanation.
 *
 * Every input here is a value the server already computed (`enabled`,
 * `capabilities`, the per-level `requests`/`renewableFrom`, `cooldownUntil`):
 * this function only combines them, it never re-derives eligibility from
 * whether a field happens to be present.
 */
export function canOpenRequest(
	view: ShopVerificationResponse,
	level: 2 | 3,
): CanOpenRequestResult {
	if (!view.enabled) return { ok: false, reason: "disabled" };

	if (view.capabilities.effectiveLevel < level - 1) {
		return { ok: false, reason: "notEligible" };
	}

	const key = level === 2 ? "level2" : "level3";
	const current = view.requests[key];

	if (current && OPEN_STATUSES.has(current.status)) {
		return { ok: false, reason: "open" };
	}

	if (current?.status === "approved") {
		const renewableFrom = view.renewableFrom[key];
		if (renewableFrom && Date.parse(renewableFrom) > Date.now()) {
			return { ok: false, reason: "notRenewableYet", until: renewableFrom };
		}
		return { ok: true };
	}

	if (view.cooldownUntil && Date.parse(view.cooldownUntil) > Date.now()) {
		return { ok: false, reason: "cooldown", until: view.cooldownUntil };
	}

	return { ok: true };
}

/**
 * The renewal-window boundary for a level, for a screen that wants to show
 * "renewable from <date>" without recomputing `canOpenRequest`'s rule itself.
 * Returns null when there is nothing to show: no boundary recorded, or the
 * window is already open.
 */
export function formatRenewalWindow(
	view: ShopVerificationResponse,
	level: 2 | 3,
	now: Date = new Date(),
): string | null {
	const key = level === 2 ? "level2" : "level3";
	const renewableFrom = view.renewableFrom[key];
	if (!renewableFrom) return null;
	const at = Date.parse(renewableFrom);
	if (!Number.isFinite(at) || at <= now.getTime()) return null;
	return renewableFrom;
}
