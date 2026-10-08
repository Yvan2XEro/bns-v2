export const RISK_SUBJECT_TYPES = ["user", "shop", "phone", "device"] as const;

export const RISK_SIGNALS = [
	"velocity.orders_per_phone",
	"velocity.checkout_attempts",
	"velocity.payout_account_changes",
	"velocity.shop_creation",
	"velocity.accounts_per_device",
	"identity.duplicate_document",
	"identity.duplicate_payout_account",
	"orders.seller_cancellation_ratio",
	"orders.dispute_ratio",
	"cod.refusal_streak",
	"cod.refusal_ratio_shop",
	"resale.self_dealing",
	"resale.shared_identity",
	"resale.handover_at_supplier",
	"resale.buyer_concentration",
	"resale.cancellation_pattern",
	"resale.refusal_pattern",
	"dispute_lost_seller",
	"counterfeit_confirmed",
	"refund_overdue",
	"seller_no_response",
	"unavailable_after_confirmation",
	"dispute_abuse_buyer",
	"cod_refusal_abuse",
	"serial_withdrawal",
	"evidence_reused",
	"review_extortion",
	"resale_collusion_suspected",
	"commission_credit_unpaid",
] as const;

export const RISK_SEVERITIES = ["low", "medium", "high"] as const;
export const RISK_STATUSES = ["open", "reviewed", "dismissed", "actioned"] as const;
export const RISK_RESOLUTIONS = [
	"none",
	"warned",
	"limited",
	"user_suspended",
	"shop_suspended",
	"payouts_held",
	"resale_link_suspended",
	"order_cancelled",
	"false_positive",
] as const;
export const RISK_AUTO_EFFECTS = [
	"payout_hold",
	"commission_hold",
	"limit_applied",
] as const;

export type RiskSubjectType = (typeof RISK_SUBJECT_TYPES)[number];
export type RiskSignal = (typeof RISK_SIGNALS)[number];
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];
export type RiskStatus = (typeof RISK_STATUSES)[number];
export type RiskResolution = (typeof RISK_RESOLUTIONS)[number];
export type RiskAutoEffect = (typeof RISK_AUTO_EFFECTS)[number];

/** Safe, shared projection returned by the moderation queue and detail routes. */
export interface RiskFlagQueueItem {
	id: string;
	subjectType: RiskSubjectType;
	subjectLabel: string | null;
	signal: RiskSignal;
	score: number;
	severity: RiskSeverity;
	status: RiskStatus;
	occurrences: number;
	firstSeenAt: string;
	lastSeenAt: string;
	autoEffects: RiskAutoEffect[] | null;
	resolution: RiskResolution;
	resolutionNote: string | null;
	reviewedAt: string | null;
}

export interface RiskFlagQueuePage {
	items: RiskFlagQueueItem[];
	hasMore: boolean;
	nextCursor: string | null;
}

export interface RiskEvidenceRow {
	label: string;
	value: string | number | boolean | null;
}

export interface RiskModerationHistoryEntry {
	id: string;
	action: string;
	createdAt: string;
}

export interface RiskFlagDetail {
	flag: RiskFlagQueueItem;
	subject: Record<string, unknown>;
	evidenceRows: RiskEvidenceRow[];
	relatedFlags: RiskFlagQueueItem[];
	moderationHistory: RiskModerationHistoryEntry[];
}

export type RiskFlagDecisionInput = {
	outcome: "reviewed" | "dismissed" | "actioned";
	resolution?: RiskResolution;
	note?: string | null;
	action?:
		| {
				type: "suspend_user";
				targetId: string;
				reason: string;
				durationDays: number | null;
			}
		| {
				type: "suspend_shop";
				targetId: string;
				reason: string;
				durationDays: number | null;
			}
		| {
				type: "hold_payouts";
				targetId: string;
				reason: string;
				durationDays: number | null;
			}
		| {
				type: "release_holds";
				targetId: string;
				reason: string;
				durationDays: number | null;
			}
		| {
				type: "suspend_resale_link";
				targetId: string;
				reason: string;
				durationDays: number | null;
			}
		| {
				type: "cancel_order";
				targetId: string;
				reason: string;
				durationDays: number | null;
			};
};
