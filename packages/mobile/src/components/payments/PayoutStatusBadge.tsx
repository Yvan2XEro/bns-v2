import { StatusTag, type StatusTone } from "@/src/components/shop/Tags";
import { useTranslation } from "@/src/lib/i18n";
import { PAYOUT_STATUSES, type PayoutStatus } from "@/src/lib/paymentStatus";

/**
 * Toned by what a payout asks of the seller, in the shared `StatusTag`
 * vocabulary: a payout on its way is moving (info), not waiting on them.
 */
const TONE: Record<PayoutStatus, StatusTone> = {
	scheduled: "neutral",
	pending: "info",
	sent: "info",
	processing: "info",
	complete: "success",
	failed: "danger",
	reversed: "danger",
	cancelled: "neutral",
};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
	const { t } = useTranslation();
	return (
		<StatusTag
			label={t(PAYOUT_STATUSES[status])}
			tone={TONE[status] ?? "neutral"}
		/>
	);
}
