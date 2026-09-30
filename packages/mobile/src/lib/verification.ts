/**
 * Shared verification logic — the mobile mirror of `packages/web/src/lib/verification.ts`
 * (and its `verification-business.ts` / `verification-decision.ts` siblings). Two copies is
 * what the repository's package boundary forces: each client needs these to gate a button
 * or build a screen, and the two test files assert the same table, so a divergence between
 * them fails a test rather than shipping. Business rules themselves stay on the API
 * (`services/verification.ts`, `lib/verificationTransitions.ts`, `lib/shopCapabilities.ts`,
 * `lib/verificationSignals.ts`) — nothing here decides anything the server does not also
 * decide; these functions only let a screen render without waiting on a round trip.
 */

import type {
	BadgeLevel,
	BusinessType,
	OwnerVerificationRequest,
	ShopCapabilities,
	ShopVerificationResponse,
	VerificationDocumentKind,
	VerificationReviewerViewer,
	VerificationStatus,
} from "../types/api";

// ─── Badges ───────────────────────────────────────────────────────────────────

const BADGE_BY_LEVEL: Record<number, BadgeLevel> = {
	1: "phone",
	2: "identity",
	3: "business",
};

/**
 * `level` here is always the server's already-computed effective level (a
 * plain, expiry-aware number every shop-bearing response carries) — this is
 * a display-label lookup, never a permission decision.
 */
export function badgeForLevel(level: number): BadgeLevel | null {
	return BADGE_BY_LEVEL[level] ?? null;
}

const BADGE_LABEL_KEYS: Record<
	BadgeLevel,
	"levelPhone" | "levelIdentity" | "levelBusiness"
> = {
	phone: "levelPhone",
	identity: "levelIdentity",
	business: "levelBusiness",
};

export function badgeLabelKey(
	badge: BadgeLevel | null | undefined,
): "levelPhone" | "levelIdentity" | "levelBusiness" | null {
	return badge ? BADGE_LABEL_KEYS[badge] : null;
}

// ─── Level ladder ─────────────────────────────────────────────────────────────

export interface LadderRung {
	level: 1 | 2 | 3;
	state: "reached" | "current" | "locked";
}

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

// ─── Opening a request ────────────────────────────────────────────────────────

const OPEN_STATUSES: readonly VerificationStatus[] = [
	"draft",
	"submitted",
	"in_review",
	"needs_info",
];

export type CanOpenResult =
	| { ok: true }
	| { ok: false; reason: "disabled" | "notEligible" | "open" }
	| { ok: false; reason: "cooldown" | "notRenewableYet"; until: string };

/**
 * A discriminated result, never a bare boolean, so a screen can name the
 * reason it refuses instead of showing a disabled button with no explanation.
 */
export function canOpenRequest(
	view: ShopVerificationResponse,
	level: 2 | 3,
): CanOpenResult {
	if (!view.enabled) return { ok: false, reason: "disabled" };
	if (level === 3 && view.capabilities.effectiveLevel < 2) {
		return { ok: false, reason: "notEligible" };
	}

	const current = level === 2 ? view.requests.level2 : view.requests.level3;
	if (current && OPEN_STATUSES.includes(current.status)) {
		return { ok: false, reason: "open" };
	}

	if (view.cooldownUntil) {
		return { ok: false, reason: "cooldown", until: view.cooldownUntil };
	}

	if (current?.status === "approved") {
		const renewableFrom =
			level === 2 ? view.renewableFrom.level2 : view.renewableFrom.level3;
		if (renewableFrom && Date.parse(renewableFrom) > Date.now()) {
			return { ok: false, reason: "notRenewableYet", until: renewableFrom };
		}
	}

	return { ok: true };
}

// ─── Status tone ──────────────────────────────────────────────────────────────

export type StatusTone = "positive" | "negative" | "warning" | "neutral";

export function statusToneKey(status: VerificationStatus): StatusTone {
	switch (status) {
		case "approved":
			return "positive";
		case "rejected":
		case "revoked":
			return "negative";
		case "needs_info":
			return "warning";
		default:
			return "neutral";
	}
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelineEntry {
	status: VerificationStatus;
	at: string;
	source: OwnerVerificationRequest["statusHistory"][number]["source"];
	/** The one entry matching the request's live status. */
	current: boolean;
	message: string | null;
	reasonCode: string | null;
}

/**
 * Newest first. A vendor-source step (the automatic level-2 auto-submit) is
 * never shown to the seller — it is not an action they took or watched. The
 * reviewer's info-request and the final decision attach to the history entry
 * recorded at the same instant, which is how each one was written.
 */
export function buildTimeline(
	request: Pick<
		OwnerVerificationRequest,
		"status" | "statusHistory" | "infoRequests" | "decision"
	>,
): TimelineEntry[] {
	const visible = request.statusHistory.filter(
		(entry) => entry.source !== "vendor",
	);
	const sorted = [...visible].sort(
		(a, b) => Date.parse(b.at) - Date.parse(a.at),
	);

	let currentAssigned = false;
	return sorted.map((entry) => {
		const isCurrent = !currentAssigned && entry.status === request.status;
		if (isCurrent) currentAssigned = true;

		const infoRequest = request.infoRequests.find(
			(candidate) => candidate.requestedAt === entry.at,
		);
		const decision =
			request.decision?.decidedAt === entry.at ? request.decision : null;

		return {
			status: entry.status,
			at: entry.at,
			source: entry.source,
			current: isCurrent,
			message: decision?.sellerMessage ?? infoRequest?.message ?? null,
			reasonCode: decision?.reasonCode ?? infoRequest?.reasonCode ?? null,
		};
	});
}

// ─── KYC polling ──────────────────────────────────────────────────────────────

export const POLL_INTERVAL_MS = 3000;
export const POLL_TIMEOUT_MS = 120_000;

const POLLING_STATUSES: readonly VerificationStatus[] = ["draft", "submitted"];

/**
 * The level-2 return screen polls `useShopVerification` while the vendor is
 * still deciding: once the request leaves `draft`/`submitted` (approved,
 * rejected, or sent back for more information) there is an answer to show,
 * and the poll stops whether or not the answer is good news.
 */
export function shouldKeepPolling(
	view: Pick<ShopVerificationResponse, "requests">,
	level: 2 | 3,
	elapsedMs: number,
): boolean {
	if (elapsedMs >= POLL_TIMEOUT_MS) return false;
	const current = level === 2 ? view.requests.level2 : view.requests.level3;
	if (!current) return false;
	return POLLING_STATUSES.includes(current.status);
}

// ─── Business documents ───────────────────────────────────────────────────────

/** Mirrors `REQUIRED_DOCUMENTS` in `services/verificationDocuments.ts` exactly. */
export const REQUIRED_DOCUMENTS: Record<
	BusinessType,
	readonly VerificationDocumentKind[]
> = {
	entreprenant: ["entreprenant_declaration", "niu_certificate"],
	sole_trader: ["rccm_extract", "niu_certificate"],
	company: ["rccm_extract", "niu_certificate"],
	cooperative: ["rccm_extract", "niu_certificate"],
};

export function requiredKinds(
	businessType: BusinessType,
	legalRepresentativeIsOwner: boolean,
): VerificationDocumentKind[] {
	const base: VerificationDocumentKind[] = [
		...REQUIRED_DOCUMENTS[businessType],
	];
	if (!legalRepresentativeIsOwner) {
		base.push("legal_representative_id", "mandate");
	}
	return base;
}

export function missingKinds(
	values: { businessType: BusinessType; legalRepresentativeIsOwner: boolean },
	documents: { kind: VerificationDocumentKind | string }[],
): VerificationDocumentKind[] {
	const present = new Set(documents.map((document) => document.kind));
	return requiredKinds(
		values.businessType,
		values.legalRepresentativeIsOwner,
	).filter((kind) => !present.has(kind));
}

/** The business-form fields `services/verification.ts`'s `assertBusinessValid` requires. */
export interface BusinessValues {
	businessType: BusinessType;
	legalName: string;
	tradeName: string;
	rccmNumber: string;
	entreprenantDeclarationNumber: string;
	niu: string;
	registeredAddress: string;
	city: string;
	legalRepresentativeName: string;
	legalRepresentativeIsOwner: boolean;
}

function filled(value: string | null | undefined): boolean {
	return Boolean(value?.trim());
}

/**
 * Mirrors `assertBusinessValid` on the API: the registration number required
 * depends on the business type, and every other field is a plain non-empty
 * check — the server's own gate is this same rule, not a full zod parse.
 */
function businessValuesComplete(values: BusinessValues): boolean {
	const registrationNumber =
		values.businessType === "entreprenant"
			? values.entreprenantDeclarationNumber
			: values.rccmNumber;
	return [
		values.legalName,
		values.registeredAddress,
		values.city,
		values.legalRepresentativeName,
		values.niu,
		registrationNumber,
	].every(filled);
}

export function canSubmit(
	values: BusinessValues,
	documents: { kind: VerificationDocumentKind | string }[],
): boolean {
	if (!businessValuesComplete(values)) return false;
	return missingKinds(values, documents).length === 0;
}

// ─── Reviewer decisions ───────────────────────────────────────────────────────

export type ReviewerAction =
	| "claim"
	| "release"
	| "request_info"
	| "approve"
	| "reject"
	| "revoke";

/**
 * Reads the permission the API's `viewer` block states, never a value being
 * present — `assignee` is display only. A conflict of interest offers
 * nothing, whatever else the viewer flags say.
 *
 * Revoking an approved request reads `canRevoke`, never `canDecide`:
 * `applyApproval` clears `assignee` on every approval, so `canDecide`
 * (assignee-gated) is always false once a request reaches `approved`.
 * `canRevoke` is computed the same way `revokeRequest` itself authorises —
 * conflict-of-interest and rank, no assignee requirement.
 */
export function availableActions(
	viewer: VerificationReviewerViewer,
	status: VerificationStatus,
): ReviewerAction[] {
	if (viewer.conflictOfInterest) return [];

	const actions: ReviewerAction[] = [];
	if (viewer.canClaim && status === "submitted") actions.push("claim");
	if (viewer.canDecide && status === "in_review") {
		actions.push("release", "request_info", "approve", "reject");
	}
	if (viewer.canRevoke && status === "approved") actions.push("revoke");
	return actions;
}

// ─── Level-3 checklist ────────────────────────────────────────────────────────

export const CHECKLIST_ITEMS = [
	"name_matches_registry",
	"registration_number_matches_document",
	"niu_matches_certificate",
	"representative_matches_identity_or_mandate",
	"documents_legible_and_current",
] as const;

export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];

export function checklistComplete(
	checklist: Partial<Record<ChecklistItem, boolean>>,
): boolean {
	return CHECKLIST_ITEMS.every((item) => checklist[item] === true);
}
