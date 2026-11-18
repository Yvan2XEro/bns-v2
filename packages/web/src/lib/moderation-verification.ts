import type { ModerationQueue } from "~/hooks/use-moderation-verification";
import type { StatusTone } from "~/lib/verification";
import type { User } from "~/types";

/** A page below moderator rank never reaches `/moderation/*`: `notFound()`, not a redirect, so its existence is not advertised. */
export function isModerator(
	user: Pick<User, "role"> | null | undefined,
): boolean {
	return user?.role === "moderator" || user?.role === "admin";
}

export interface QueueTab {
	key: ModerationQueue;
	count: number | null;
}

const QUEUE_ORDER: ModerationQueue[] = [
	"to_review",
	"mine",
	"needs_info",
	"decided",
];

/**
 * The four queue tabs. Only "to_review" ever carries a count — the API's
 * summary endpoint only tracks the intake backlog, so the other three show
 * no badge rather than a manufactured zero.
 */
export function queueTabs(
	summary: { pendingVerifications: number } | undefined,
): QueueTab[] {
	return QUEUE_ORDER.map((key) => ({
		key,
		count: key === "to_review" ? (summary?.pendingVerifications ?? null) : null,
	}));
}

const NEGATIVE_SIGNALS: Record<string, true> = {
	identity_reused: true,
	document_reused: true,
	kyc_declined: true,
	underage: true,
};

const WARNING_SIGNALS: Record<string, true> = {
	name_mismatch: true,
	kyc_review: true,
	rccm_reused: true,
	niu_reused: true,
};

/**
 * The colour family a signal chip renders under: negative for what fraud
 * looks like, warning for what a paperwork mismatch looks like, neutral
 * (`niu_format`, and anything the API adds later) for the rest.
 */
export function signalToneKey(code: string): StatusTone {
	if (NEGATIVE_SIGNALS[code]) return "negative";
	if (WARNING_SIGNALS[code]) return "warning";
	return "neutral";
}

export type RelativeAgeUnit = "minutes" | "hours" | "days";

export interface RelativeAge {
	unit: RelativeAgeUnit;
	count: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How long ago a request was submitted, bucketed the way `AgeChip` renders
 * it: minutes under an hour, hours under a day, days beyond that. `null`
 * for a request that was never submitted (still a draft), and clamped to
 * zero rather than negative for a clock skew between this client and the
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
