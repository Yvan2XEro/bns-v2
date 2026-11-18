import type { ModerationAction } from "../collections/ModerationLog";
import type { VerificationStatus } from "../collections/VerificationRequests";

export type TransitionSource = "seller" | "reviewer" | "vendor" | "system";

export type TransitionName =
	| "open"
	| "submit"
	| "claim"
	| "release"
	| "request_info"
	| "approve"
	| "auto_approve"
	| "reject"
	| "revoke"
	| "expire"
	| "resubmit";

export interface Transition {
	from: readonly VerificationStatus[];
	to: VerificationStatus;
	by: TransitionSource;
	/** null where the change is the seller's own and leaves no moderation trace. */
	logAction: ModerationAction | null;
}

export const TERMINAL_STATUSES = ["rejected", "revoked", "expired"] as const;
export const OPEN_STATUSES = [
	"draft",
	"submitted",
	"in_review",
	"needs_info",
] as const;

export function isTerminal(status: VerificationStatus): boolean {
	return (TERMINAL_STATUSES as readonly string[]).includes(status);
}
export function isOpen(status: VerificationStatus): boolean {
	return (OPEN_STATUSES as readonly string[]).includes(status);
}

/**
 * The whole state machine, as data. `services/verification.ts` consults it
 * before every write, so a refusal is one `409 verification.invalidTransition`
 * in one place rather than a guard per handler.
 *
 * `submit` covers both the seller submitting a level-3 request and the vendor
 * result moving a level-2 request out of `draft`; `resubmit` is the separate
 * `needs_info` → `submitted` path because it also stamps `respondedAt`.
 */
export const TRANSITIONS: Record<TransitionName, Transition> = {
	open: { from: [], to: "draft", by: "seller", logAction: null },
	submit: { from: ["draft"], to: "submitted", by: "seller", logAction: null },
	resubmit: {
		from: ["needs_info"],
		to: "submitted",
		by: "seller",
		logAction: null,
	},
	claim: {
		from: ["submitted"],
		to: "in_review",
		by: "reviewer",
		logAction: "verification.claim",
	},
	release: {
		from: ["in_review"],
		to: "submitted",
		by: "reviewer",
		logAction: "verification.release",
	},
	request_info: {
		from: ["in_review"],
		to: "needs_info",
		by: "reviewer",
		logAction: "verification.request_info",
	},
	approve: {
		from: ["in_review"],
		to: "approved",
		by: "reviewer",
		logAction: "verification.approve",
	},
	auto_approve: {
		from: ["submitted"],
		to: "approved",
		by: "system",
		logAction: "verification.approve",
	},
	reject: {
		from: ["in_review"],
		to: "rejected",
		by: "reviewer",
		logAction: "verification.reject",
	},
	revoke: {
		from: ["approved"],
		to: "revoked",
		by: "reviewer",
		logAction: "verification.revoke",
	},
	expire: {
		// Every `OPEN_STATUS` plus `approved`: a shop-closed cascade must be able
		// to expire a request the idle sweep never would (a `submitted` or
		// `in_review` one still waiting on a reviewer), and `approved` stays for
		// the unrelated "lapsed" cause a backing's own expiry date fires.
		from: ["draft", "submitted", "in_review", "needs_info", "approved"],
		to: "expired",
		by: "system",
		logAction: "verification.expire",
	},
};

export function canTransition(
	name: TransitionName,
	from: VerificationStatus,
): boolean {
	if (isTerminal(from)) return false;
	return TRANSITIONS[name].from.includes(from);
}

export function nextStatus(name: TransitionName): VerificationStatus {
	return TRANSITIONS[name].to;
}

export function logActionFor(name: TransitionName): ModerationAction | null {
	return TRANSITIONS[name].logAction;
}
