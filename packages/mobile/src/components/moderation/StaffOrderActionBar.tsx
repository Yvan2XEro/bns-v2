import { DecisionBar, DecisionButton } from "./ModerationKit";
import type { ModerationPalette, Translate } from "./theme";

interface StaffOrderActionBarProps {
	/** Both flags come from `availableActions(order, "staff")`, never from a status test here. */
	canCancel: boolean;
	canReceipt: boolean;
	receiptPending: boolean;
	onCancel: () => void;
	onReceipt: () => void;
	/** Kept for callers; the bar reads the shared palette itself. */
	c?: ModerationPalette;
	t: Translate;
}

/**
 * The receipt is a harmless read, so it sits left as a plain outline; the
 * cancellation opens its reason sheet and reads as the sanction it is.
 */
export function StaffOrderActionBar({
	canCancel,
	canReceipt,
	receiptPending,
	onCancel,
	onReceipt,
	t,
}: StaffOrderActionBarProps) {
	if (!canCancel && !canReceipt) {
		return <DecisionBar note={{ text: t("moderationOrder.noAction") }} />;
	}
	return (
		<DecisionBar>
			{canReceipt ? (
				<DecisionButton
					variant="secondary"
					icon="receipt-outline"
					label={t("moderationOrder.receipt")}
					onPress={onReceipt}
					pending={receiptPending}
				/>
			) : null}
			{canCancel ? (
				<DecisionButton
					variant="dangerOutline"
					icon="close-circle-outline"
					label={t("moderationOrder.cancel")}
					onPress={onCancel}
				/>
			) : null}
		</DecisionBar>
	);
}
