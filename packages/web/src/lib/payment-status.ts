/**
 * Display-only vocabulary for P5's protected payment: which `Payments.*`
 * translation key a screen shows for each server value. Every map is an
 * explicit literal on purpose — a key built at runtime
 * (`t(\`Payments.${value}\`)`) is invisible to `messages-keys.test.ts`, so
 * each value here is resolved against both locales in the test beside this
 * file instead. Mobile holds the same tables in `src/lib/paymentStatus.ts`;
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
	created: "intentStatus_created",
	pending: "intentStatus_pending",
	succeeded: "intentStatus_succeeded",
	failed: "intentStatus_failed",
	cancelled: "intentStatus_cancelled",
	expired: "intentStatus_expired",
};

/** The failed screen's sentence for each `failureCode` the intent stores. */
export const PAYMENT_FAILURE_MESSAGES: Record<PaymentFailureCode, string> = {
	declined: "failure_declined",
	insufficient_funds: "failure_insufficientFunds",
	timeout: "failure_timeout",
	limit_exceeded: "failure_limitExceeded",
	invalid_number: "failure_invalidNumber",
	provider_error: "failure_providerError",
};

// Channel values carry a dot, which next-intl reads as a path separator, so
// the keys spell the channel in camel case instead of embedding it.
export const PAYMENT_CHANNEL_LABELS: Record<PaymentChannel, string> = {
	"cm.mtn": "channel_cmMtn",
	"cm.orange": "channel_cmOrange",
};

/** Shown on the pending screen when the provider sent no `instructions`. */
export const PAYMENT_CHANNEL_INSTRUCTIONS: Record<PaymentChannel, string> = {
	"cm.mtn": "instruction_cmMtn",
	"cm.orange": "instruction_cmOrange",
};

export const PAYOUT_STATUSES: Record<PayoutStatus, string> = {
	scheduled: "payoutStatus_scheduled",
	pending: "payoutStatus_pending",
	sent: "payoutStatus_sent",
	processing: "payoutStatus_processing",
	complete: "payoutStatus_complete",
	failed: "payoutStatus_failed",
	reversed: "payoutStatus_reversed",
	cancelled: "payoutStatus_cancelled",
};

export const REFUND_STATUSES: Record<RefundStatus, string> = {
	created: "refundStatus_created",
	pending: "refundStatus_pending",
	processing: "refundStatus_processing",
	succeeded: "refundStatus_succeeded",
	failed: "refundStatus_failed",
};

export const CONNECTED_ACCOUNT_STATUSES: Record<
	ConnectedAccountStatus,
	string
> = {
	created: "accountStatus_created",
	onboarding: "accountStatus_onboarding",
	restricted: "accountStatus_restricted",
	active: "accountStatus_active",
	disabled: "accountStatus_disabled",
	deauthorized: "accountStatus_deauthorized",
};

export const PAYOUT_ACCOUNT_STATUSES: Record<PayoutAccountStatus, string> = {
	pending_verification: "payoutAccountStatus_pendingVerification",
	pending_review: "payoutAccountStatus_pendingReview",
	active: "payoutAccountStatus_active",
	rejected: "payoutAccountStatus_rejected",
	replaced: "payoutAccountStatus_replaced",
};

export const PAYOUT_METHODS: Record<PayoutMethod, string> = {
	mtn_momo: "payoutMethod_mtnMomo",
	orange_money: "payoutMethod_orangeMoney",
	bank: "payoutMethod_bank",
};

export const NAME_MATCH_RESULTS: Record<NameMatchVerdict, string> = {
	match: "nameMatch_match",
	partial: "nameMatch_partial",
	mismatch: "nameMatch_mismatch",
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
	security: "holdCategory_security",
	review: "holdCategory_review",
	operations: "holdCategory_operations",
};

export const HOLD_CATEGORY_DESCRIPTIONS: Record<HoldCategory, string> = {
	security: "holdCategoryBody_security",
	review: "holdCategoryBody_review",
	operations: "holdCategoryBody_operations",
};

export function holdReasonCategory(reason: PayoutHoldReason): HoldCategory {
	return HOLD_REASON_CATEGORIES[reason];
}
