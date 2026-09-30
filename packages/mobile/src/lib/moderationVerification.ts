/**
 * Mobile mirror of `packages/web/src/lib/moderation-verification.ts` — the
 * hub's queue-tab counts, a review signal's colour tone, submission-age
 * bucketing and the reviewer-decision form shape the verification queue and
 * review sheet render from. Kept next to the web copy rather than shared
 * across the package boundary; `moderationVerification.test.ts` pins the same
 * table so a divergence from the web (or the API's reason lists) fails a test
 * here rather than shipping a code the server refuses.
 */

import { z } from "zod";
import type { ReviewSignalCode } from "../types/api";
import type { ReviewerAction, StatusTone } from "./verification";

// ─── Hub tabs ─────────────────────────────────────────────────────────────────

export type QueueKey = "listings" | "reports" | "verification";

/** Turns a queue key or a relative-age unit into the suffix its locale key uses (`"listings"` → `"Listings"`). */
export function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

export interface QueueTab {
	key: QueueKey;
	count: number | null;
}

/**
 * The hub's three tabs. Each count is `null`, not zero, before the summary
 * has loaded — a moderator should never read "0 pending" as an answer when
 * the honest answer is "not fetched yet".
 */
export function queueTabs(
	summary:
		| {
				pendingListings: number;
				pendingReports: number;
				pendingVerifications: number;
		  }
		| undefined,
): QueueTab[] {
	return [
		{ key: "listings", count: summary?.pendingListings ?? null },
		{ key: "reports", count: summary?.pendingReports ?? null },
		{ key: "verification", count: summary?.pendingVerifications ?? null },
	];
}

// ─── Review signal tone ───────────────────────────────────────────────────────

const NEGATIVE_SIGNALS: ReadonlySet<string> = new Set([
	"identity_reused",
	"document_reused",
	"kyc_declined",
	"underage",
]);

const WARNING_SIGNALS: ReadonlySet<string> = new Set([
	"name_mismatch",
	"kyc_review",
	"rccm_reused",
	"niu_reused",
]);

/**
 * The colour family a signal chip renders under: negative for what fraud
 * looks like, warning for what a paperwork mismatch looks like, neutral
 * (`niu_format`, and anything the API adds later) for the rest.
 */
export function signalToneKey(code: ReviewSignalCode | string): StatusTone {
	if (NEGATIVE_SIGNALS.has(code)) return "negative";
	if (WARNING_SIGNALS.has(code)) return "warning";
	return "neutral";
}

// ─── Submission age ───────────────────────────────────────────────────────────

export type RelativeAgeUnit = "minutes" | "hours" | "days";

export interface RelativeAge {
	unit: RelativeAgeUnit;
	count: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How long ago a request was submitted, bucketed the way the queue row
 * renders it: minutes under an hour, hours under a day, days beyond that.
 * `null` for a request that was never submitted (still a draft), and clamped
 * to zero rather than negative for a clock skew between this client and the
 * server that stamped `submittedAt`.
 */
export function relativeAge(
	submittedAt: string | null,
	now: Date = new Date(),
): RelativeAge | null {
	if (!submittedAt) return null;
	const at = Date.parse(submittedAt);
	if (!Number.isFinite(at)) return null;

	const diffMs = now.getTime() - at;
	if (diffMs <= 0) return { unit: "minutes", count: 0 };

	const minutes = Math.floor(diffMs / MINUTE_MS);
	if (diffMs < HOUR_MS) return { unit: "minutes", count: minutes };

	const hours = Math.floor(diffMs / HOUR_MS);
	if (diffMs < DAY_MS) return { unit: "hours", count: hours };

	return { unit: "days", count: Math.floor(diffMs / DAY_MS) };
}

// ─── Reviewer decision reason codes ───────────────────────────────────────────

/** Mirrors `packages/api/src/collections/VerificationRequests.ts`. */
export const REQUEST_INFO_REASONS = [
	"document_unreadable",
	"document_missing",
	"information_inconsistent",
	"kyc_retry",
	"other",
] as const;

export const REJECT_REASONS = [
	"document_invalid",
	"document_expired",
	"identity_mismatch",
	"liveness_failed",
	"business_mismatch",
	"duplicate_identity",
	"fraud_suspected",
	"other",
] as const;

export const REVOKE_REASONS = [
	"fraud",
	"document_forged",
	"business_closed",
	"identity_reused",
	"other",
] as const;

const REASONS_BY_ACTION: Partial<Record<ReviewerAction, readonly string[]>> = {
	request_info: REQUEST_INFO_REASONS,
	reject: REJECT_REASONS,
	revoke: REVOKE_REASONS,
};

export interface DecisionFieldConfig {
	/** `null` when this action takes no reason at all (approve). */
	reasons: readonly string[] | null;
	/** Whether the sheet's free-text field must be filled before confirming. */
	textRequired: boolean;
	/**
	 * `"sellerMessage"` is sent to the seller verbatim and is never
	 * translated; `"note"` is internal-only; `null` when this action shows no
	 * text field at all (claim, release).
	 */
	textKind: "sellerMessage" | "note" | null;
}

/**
 * What `DecisionSheet` collects for one reviewer action. Claim and release
 * never reach this — the screen dispatches them straight to the mutation,
 * with no sheet in between, because releasing undoes a claim and claiming
 * again undoes a release: neither is a mistake worth confirming.
 */
export function decisionSchema(action: ReviewerAction): DecisionFieldConfig {
	switch (action) {
		case "request_info":
			return {
				reasons: REASONS_BY_ACTION.request_info ?? null,
				textRequired: true,
				textKind: "sellerMessage",
			};
		case "reject":
			return {
				reasons: REASONS_BY_ACTION.reject ?? null,
				textRequired: true,
				textKind: "sellerMessage",
			};
		case "revoke":
			return {
				reasons: REASONS_BY_ACTION.revoke ?? null,
				textRequired: false,
				textKind: "note",
			};
		case "approve":
			return { reasons: null, textRequired: false, textKind: "note" };
		case "claim":
		case "release":
			return { reasons: null, textRequired: false, textKind: null };
	}
}

export type ReasonCodeResult =
	| { ok: true; reasonCode: string | null }
	| { ok: false };

/**
 * Parses a moderator's chosen reason code against the exact list this
 * action allows, from `REASONS_BY_ACTION` — the same table `decisionSchema`
 * built the sheet's picker from, never a second copy of it. `DecisionSheet`
 * only offers those exact values as buttons, so this is normally a no-op;
 * it exists so a value ever reaching `confirmDecision` any other way is
 * still refused here rather than forwarded to a server that would refuse it
 * for an unrelated reason (I3).
 */
export function parseReasonCode(
	action: ReviewerAction,
	choice: string | null | undefined,
): ReasonCodeResult {
	const allowed = REASONS_BY_ACTION[action];
	if (!allowed || allowed.length === 0) return { ok: true, reasonCode: null };
	const schema = z.enum(allowed as [string, ...string[]]);
	const parsed = schema.safeParse(choice);
	if (!parsed.success) return { ok: false };
	return { ok: true, reasonCode: parsed.data };
}
