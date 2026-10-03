/**
 * Display-only vocabulary for P5's protected payment: which `payments.*`
 * translation key a screen shows for each server value. Each key is fully
 * qualified — mobile calls `t()` without a namespace — so a screen writes
 * `t(PAYOUT_STATUSES[status])` and never assembles a key at runtime: a
 * template key (`t(\`payments.${value}\`)`) is invisible to
 * `src/locales/keys.test.ts`, so each value here is resolved against both
 * locales in the test beside this file instead. Web holds the same tables in
 * `src/lib/payment-status.ts`, namespace-relative;
 * `packages/api/tests/int/payment-vocab-parity.int.spec.ts` holds both to the
 * API's own enums and to each other, cell for cell.
 */

export type PaymentIntentStatus =
	| "created"
	| "pending"
	| "succeeded"
	| "failed"
	| "cancelled"
	| "expired";

export type PaymentFailureCode =
	| "declined"
	| "insufficient_funds"
	| "timeout"
	| "limit_exceeded"
	| "invalid_number"
	| "provider_error";

export type PaymentChannel = "cm.mtn" | "cm.orange";

export type PayoutStatus =
	| "scheduled"
	| "pending"
	| "sent"
	| "processing"
	| "complete"
	| "failed"
	| "reversed"
	| "cancelled";

export type RefundStatus =
	| "created"
	| "pending"
	| "processing"
	| "succeeded"
	| "failed";

export type ConnectedAccountStatus =
	| "created"
	| "onboarding"
	| "restricted"
	| "active"
	| "disabled"
	| "deauthorized";

export type PayoutAccountStatus =
	| "pending_verification"
	| "pending_review"
	| "active"
	| "rejected"
	| "replaced";

export type PayoutMethod = "mtn_momo" | "orange_money" | "bank";

export type NameMatchVerdict = "match" | "partial" | "mismatch";

export type PayoutHoldReason =
	| "payout_account_changed"
	| "fraud_signal"
	| "reconciliation_mismatch"
	| "dispute_open"
	| "return_open"
	| "moderation"
	| "payout_failed_repeatedly"
	| "shop_suspended";

export type HoldCategory = "security" | "review" | "operations";

export const PAYMENT_INTENT_STATUSES: Record<PaymentIntentStatus, string> = {
	created: "payments.intentStatus_created",
	pending: "payments.intentStatus_pending",
	succeeded: "payments.intentStatus_succeeded",
	failed: "payments.intentStatus_failed",
	cancelled: "payments.intentStatus_cancelled",
	expired: "payments.intentStatus_expired",
};

/** The failed screen's sentence for each `failureCode` the intent stores. */
export const PAYMENT_FAILURE_MESSAGES: Record<PaymentFailureCode, string> = {
	declined: "payments.failure_declined",
	insufficient_funds: "payments.failure_insufficientFunds",
	timeout: "payments.failure_timeout",
	limit_exceeded: "payments.failure_limitExceeded",
	invalid_number: "payments.failure_invalidNumber",
	provider_error: "payments.failure_providerError",
};

// Channel values carry a dot, which next-intl reads as a path separator, so
// the keys spell the channel in camel case, as on web, instead of embedding it.
export const PAYMENT_CHANNEL_LABELS: Record<PaymentChannel, string> = {
	"cm.mtn": "payments.channel_cmMtn",
	"cm.orange": "payments.channel_cmOrange",
};

/** Shown on the pending screen when the provider sent no `instructions`. */
export const PAYMENT_CHANNEL_INSTRUCTIONS: Record<PaymentChannel, string> = {
	"cm.mtn": "payments.instruction_cmMtn",
	"cm.orange": "payments.instruction_cmOrange",
};

export const PAYOUT_STATUSES: Record<PayoutStatus, string> = {
	scheduled: "payments.payoutStatus_scheduled",
	pending: "payments.payoutStatus_pending",
	sent: "payments.payoutStatus_sent",
	processing: "payments.payoutStatus_processing",
	complete: "payments.payoutStatus_complete",
	failed: "payments.payoutStatus_failed",
	reversed: "payments.payoutStatus_reversed",
	cancelled: "payments.payoutStatus_cancelled",
};

export const REFUND_STATUSES: Record<RefundStatus, string> = {
	created: "payments.refundStatus_created",
	pending: "payments.refundStatus_pending",
	processing: "payments.refundStatus_processing",
	succeeded: "payments.refundStatus_succeeded",
	failed: "payments.refundStatus_failed",
};

export const CONNECTED_ACCOUNT_STATUSES: Record<
	ConnectedAccountStatus,
	string
> = {
	created: "payments.accountStatus_created",
	onboarding: "payments.accountStatus_onboarding",
	restricted: "payments.accountStatus_restricted",
	active: "payments.accountStatus_active",
	disabled: "payments.accountStatus_disabled",
	deauthorized: "payments.accountStatus_deauthorized",
};

export const PAYOUT_ACCOUNT_STATUSES: Record<PayoutAccountStatus, string> = {
	pending_verification: "payments.payoutAccountStatus_pendingVerification",
	pending_review: "payments.payoutAccountStatus_pendingReview",
	active: "payments.payoutAccountStatus_active",
	rejected: "payments.payoutAccountStatus_rejected",
	replaced: "payments.payoutAccountStatus_replaced",
};

export const PAYOUT_METHODS: Record<PayoutMethod, string> = {
	mtn_momo: "payments.payoutMethod_mtnMomo",
	orange_money: "payments.payoutMethod_orangeMoney",
	bank: "payments.payoutMethod_bank",
};

export const NAME_MATCH_RESULTS: Record<NameMatchVerdict, string> = {
	match: "payments.nameMatch_match",
	partial: "payments.nameMatch_partial",
	mismatch: "payments.nameMatch_mismatch",
};

/**
 * The owner sees a hold's category, never its reason: naming
 * `fraud_signal` to the person it suspects tells them which rule fired.
 */
export const HOLD_REASON_CATEGORIES: Record<PayoutHoldReason, HoldCategory> = {
	payout_account_changed: "security",
	fraud_signal: "security",
	dispute_open: "review",
	return_open: "review",
	moderation: "review",
	shop_suspended: "review",
	reconciliation_mismatch: "operations",
	payout_failed_repeatedly: "operations",
};

export const HOLD_CATEGORY_LABELS: Record<HoldCategory, string> = {
	security: "payments.holdCategory_security",
	review: "payments.holdCategory_review",
	operations: "payments.holdCategory_operations",
};

export const HOLD_CATEGORY_DESCRIPTIONS: Record<HoldCategory, string> = {
	security: "payments.holdCategoryBody_security",
	review: "payments.holdCategoryBody_review",
	operations: "payments.holdCategoryBody_operations",
};

export function holdReasonCategory(reason: PayoutHoldReason): HoldCategory {
	return HOLD_REASON_CATEGORIES[reason];
}
