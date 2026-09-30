import type { Payload, PayloadRequest } from "payload";
import { VERIFICATION_CONTEXT } from "../services/verification";
import { OPEN_STATUSES, TERMINAL_STATUSES } from "./verificationTransitions";

/** The periods declared in the processing register. Changing one here changes the product's promise. */
export const RETENTION = {
	documentsAfterTerminalDays: 90,
	documentsAfterFraudRevocationDays: 365,
	requestRowYears: 5,
	documentViewYears: 3,
	vendorDeletionAfterDecisionDays: 30,
	hashesAfterAccountDeletionDays: 365,
	draftIdleDays: 30,
	needsInfoIdleDays: 30,
	staleClaimHours: 48,
	expiryNoticeDays: [30, 7],
} as const;

const DAY_MS = 86_400_000;

/** A revocation reason severe enough to justify keeping the evidence for a year instead of 90 days. */
const FRAUD_REVOCATION_REASONS = new Set(["fraud", "document_forged"]);

/**
 * When a terminal request's documents become due for deletion. `null` while
 * the request is still open or approved (its documents are still evidence
 * for an active grant), never for a request that never leaves the pipeline.
 */
export function documentPurgeDueAt(
	request: {
		status: string;
		updatedAt: string | Date;
		decision?: { reasonCode?: string | null } | null;
	},
	// Unused here: the due date is absolute, and the caller compares it
	// against `now` itself. Kept as a parameter because every retention
	// function in this module answers "due by when", relative to a `now`
	// the caller controls (tests included) — a signature this file's
	// callers can treat uniformly across all three.
	_now: Date,
): Date | null {
	if (!(TERMINAL_STATUSES as readonly string[]).includes(request.status)) {
		return null;
	}
	const isFraudRevocation =
		request.status === "revoked" &&
		FRAUD_REVOCATION_REASONS.has(request.decision?.reasonCode ?? "");
	const days = isFraudRevocation
		? RETENTION.documentsAfterFraudRevocationDays
		: RETENTION.documentsAfterTerminalDays;
	return new Date(new Date(request.updatedAt).getTime() + days * DAY_MS);
}

/** When a terminal request's names, business block and decision text are stripped for good. */
export function rowStripDueAt(request: {
	status: string;
	updatedAt: string | Date;
}): Date | null {
	if (!(TERMINAL_STATUSES as readonly string[]).includes(request.status)) {
		return null;
	}
	return new Date(
		new Date(request.updatedAt).getTime() +
			RETENTION.requestRowYears * 365 * DAY_MS,
	);
}

/** When a decided request's vendor session is due to be deleted at the vendor, or `null` if there is none to delete. */
export function vendorDeletionDueAt(request: {
	kyc?: { decidedAt?: string | null } | null;
}): Date | null {
	if (!request.kyc?.decidedAt) return null;
	return new Date(
		new Date(request.kyc.decidedAt).getTime() +
			RETENTION.vendorDeletionAfterDecisionDays * DAY_MS,
	);
}

/**
 * Account deletion's own, immediate cousin of the nightly row-strip: only
 * the names go, on every request this account ever submitted, decided or
 * not. `documentNumberHash` stays — the fraud-prevention duplicate check is
 * the one thing this hash exists for, and it must still catch the same
 * document reappearing on another shop after this account is gone.
 */
export async function clearKycNames(
	payload: Payload,
	userId: string,
	req?: PayloadRequest,
): Promise<void> {
	const found = await payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: { submittedBy: { equals: userId } },
	});
	for (const request of found.docs) {
		if (!request.kyc) continue;
		await payload.update({
			collection: "verification-requests",
			id: request.id,
			req,
			overrideAccess: true,
			context: VERIFICATION_CONTEXT,
			data: {
				kyc: { ...request.kyc, givenNames: null, familyName: null },
			},
		});
	}
}

/**
 * Deletes every request still occupying an open shop+level slot for these
 * shops outright, rather than expiring it: the account is gone, so there is
 * no seller left to answer a reviewer and no fraud-prevention reason to keep
 * a request that was never decided.
 */
export async function deleteOpenRequests(
	payload: Payload,
	shopIds: string[],
	req?: PayloadRequest,
): Promise<string[]> {
	if (shopIds.length === 0) return [];
	const found = await payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: {
			and: [{ shop: { in: shopIds } }, { status: { in: [...OPEN_STATUSES] } }],
		},
	});
	const deleted: string[] = [];
	for (const request of found.docs) {
		await payload.delete({
			collection: "verification-requests",
			id: request.id,
			req,
			overrideAccess: true,
			context: VERIFICATION_CONTEXT,
		});
		deleted.push(String(request.id));
	}
	return deleted;
}
