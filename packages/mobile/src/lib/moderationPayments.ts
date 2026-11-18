import type { PayoutHoldReason } from "./paymentStatus";

/**
 * Staff see the hold's real reason, unlike a shop's own setup or payments
 * screen, which gets the category alone (`HOLD_REASON_CATEGORIES` in
 * `paymentStatus.ts`). Kept out of that file on purpose: its twelve maps are
 * pinned against the API's own vocabulary and the seller-facing namespace,
 * and this one never reaches a seller.
 */
export const MODERATION_HOLD_REASON_LABELS: Record<PayoutHoldReason, string> = {
	payout_account_changed: "moderation.paymentsHoldReason_payoutAccountChanged",
	fraud_signal: "moderation.paymentsHoldReason_fraudSignal",
	reconciliation_mismatch:
		"moderation.paymentsHoldReason_reconciliationMismatch",
	dispute_open: "moderation.paymentsHoldReason_disputeOpen",
	return_open: "moderation.paymentsHoldReason_returnOpen",
	moderation: "moderation.paymentsHoldReason_moderation",
	payout_failed_repeatedly:
		"moderation.paymentsHoldReason_payoutFailedRepeatedly",
	shop_suspended: "moderation.paymentsHoldReason_shopSuspended",
};

/** Reasons a moderator may place by hand — `shop_suspended` is the
 * suspension's own hold and only `unsuspendShop` may end it (API's
 * `SYSTEM_ONLY_HOLD_REASONS`, mirrored here display-side). */
export const MANUAL_HOLD_REASONS: readonly PayoutHoldReason[] = [
	"payout_account_changed",
	"fraud_signal",
	"reconciliation_mismatch",
	"dispute_open",
	"return_open",
	"moderation",
	"payout_failed_repeatedly",
];

export const PAYOUT_ORIGIN_LABELS: Record<
	"platform_release" | "provider_schedule",
	string
> = {
	platform_release: "moderation.paymentsOrigin_platformRelease",
	provider_schedule: "moderation.paymentsOrigin_providerSchedule",
};
