import type { Payload, PayloadRequest } from "payload";
import { VERIFICATION_CONTEXT } from "../services/verification";
import { OPEN_STATUSES, TERMINAL_STATUSES } from "./verificationTransitions";

/**
 * The periods declared in the processing register. Changing one here changes
 * the product's promise.
 *
 * No `hashesAfterAccountDeletionDays` here: the design's table names a
 * one-year hash purge anchored on account deletion, but nothing stamps a
 * `verification-requests.accountDeletedAt` for it to anchor on, and adding
 * that marker reaches into the collection schema `services/verification.ts`
 * owns. A constant with nothing to read it is worse than no constant — it
 * makes a rule that was never built look shipped. Until that marker exists,
 * a deleted account's `documentNumberHash` is covered by the ordinary
 * `requestRowYears` strip and its `verification-documents.sha256` is kept
 * for the fraud-duplicate check, same as everyone else's.
 */
export const RETENTION = {
	documentsAfterTerminalDays: 90,
	documentsAfterFraudRevocationDays: 365,
	requestRowYears: 5,
	documentViewYears: 3,
	vendorDeletionAfterDecisionDays: 30,
	draftIdleDays: 30,
	needsInfoIdleDays: 30,
	staleClaimHours: 48,
	expiryNoticeDays: [30, 7],
} as const;

const DAY_MS = 86_400_000;

/** A revocation reason severe enough to justify keeping the evidence for a year instead of 90 days. */
const FRAUD_REVOCATION_REASONS = new Set(["fraud", "document_forged"]);

interface StatusHistoryEntry {
	status?: string | null;
	at?: string | null;
}

/**
 * When this request last *became* its current status, not when it was last
 * written. `updatedAt` is bumped by any write at all — the vendor-session
 * sweep stamping `kyc.vendorDataDeletedAt`, account deletion clearing a
 * name — none of which is the event either retention clock is supposed to
 * measure from. `statusHistory` records the actual transition, so the last
 * entry matching the current status is the true anchor; `updatedAt` is only
 * a fallback for a row old enough to predate that field being written.
 */
function terminalSince(request: {
	status: string;
	updatedAt: string | Date;
	statusHistory?: StatusHistoryEntry[] | null;
}): Date {
	const history = request.statusHistory ?? [];
	for (let i = history.length - 1; i >= 0; i -= 1) {
		const entry = history[i];
		if (entry?.status === request.status && entry.at) {
			return new Date(entry.at);
		}
	}
	return new Date(request.updatedAt);
}

/**
 * When a terminal request's documents become due for deletion. `null` while
 * the request is still open or approved (its documents are still evidence
 * for an active grant), never for a request that never leaves the pipeline.
 */
export function documentPurgeDueAt(
	request: {
		status: string;
		updatedAt: string | Date;
		statusHistory?: StatusHistoryEntry[] | null;
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
	return new Date(terminalSince(request).getTime() + days * DAY_MS);
}

/** When a terminal request's names, business block and decision text are stripped for good. */
export function rowStripDueAt(request: {
	status: string;
	updatedAt: string | Date;
	statusHistory?: StatusHistoryEntry[] | null;
}): Date | null {
	if (!(TERMINAL_STATUSES as readonly string[]).includes(request.status)) {
		return null;
	}
	return new Date(
		terminalSince(request).getTime() + RETENTION.requestRowYears * 365 * DAY_MS,
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
 * a request that was never decided. Its `verification-documents` rows go
 * with it — unlike a terminal request, an open one has no decided outcome to
 * keep evidence for, so leaving them behind would only orphan rows carrying
 * `sha256`, `originalFilename` and `uploadedBy` that nothing ever reaches
 * again (mirrors `deleteDraft`, `services/verification.ts`).
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
		const documents = await payload.find({
			collection: "verification-documents",
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
			req,
			where: { request: { equals: request.id } },
		});
		for (const document of documents.docs) {
			await payload.delete({
				collection: "verification-documents",
				id: document.id,
				req,
				overrideAccess: true,
				context: VERIFICATION_CONTEXT,
			});
		}

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

/**
 * Removes the didit `webhook-events` rows tied to every request this account
 * ever submitted: unlike a payment webhook, a didit body carries no
 * transaction the law requires kept, so once the account behind it is gone
 * there is nothing left to keep it for. Matched the same way
 * `recordWebhookEvent` writes it — both `reference` and `providerReference`
 * hold the KYC `sessionRef` (there is no separate payment reference for a
 * non-payment vendor) — over every request regardless of status, since a
 * decided request's webhook history is no more evidence than its cleared
 * name is.
 */
export async function deleteDiditWebhookEvents(
	payload: Payload,
	userId: string,
	req?: PayloadRequest,
): Promise<string[]> {
	const requests = await payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: { submittedBy: { equals: userId } },
	});
	const sessionRefs = requests.docs
		.map((request) => request.kyc?.sessionRef)
		.filter((ref): ref is string => typeof ref === "string" && ref.length > 0);
	// Same hazard `findOwnedMediaIds` (accountDeletion.ts) guards for media: an
	// `{ in: [] }` is not reliably an empty match across adapters, and a
	// match-all here would delete every didit webhook event in the database.
	if (sessionRefs.length === 0) return [];

	const found = await payload.find({
		collection: "webhook-events",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: {
			and: [
				{ provider: { equals: "didit" } },
				{
					or: [
						{ reference: { in: sessionRefs } },
						{ providerReference: { in: sessionRefs } },
					],
				},
			],
		},
	});
	const deleted: string[] = [];
	for (const event of found.docs) {
		await payload.delete({
			collection: "webhook-events",
			id: event.id,
			req,
			overrideAccess: true,
		});
		deleted.push(String(event.id));
	}
	return deleted;
}
