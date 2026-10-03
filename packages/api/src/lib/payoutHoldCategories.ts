import type { PayoutHoldReason } from "../collections/PayoutHolds";

export type PayoutHoldCategory = "security" | "review" | "operations";

/**
 * What a shop is told about a hold. The reason itself stays server-side:
 * naming `fraud_signal` to the seller it suspects tells them which rule fired.
 */
export const PAYOUT_HOLD_CATEGORIES: Record<
	PayoutHoldReason,
	PayoutHoldCategory
> = {
	payout_account_changed: "security",
	fraud_signal: "security",
	dispute_open: "review",
	return_open: "review",
	moderation: "review",
	shop_suspended: "review",
	reconciliation_mismatch: "operations",
	payout_failed_repeatedly: "operations",
};
