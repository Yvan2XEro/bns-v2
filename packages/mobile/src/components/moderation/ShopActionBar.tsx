import type { ShopStatus } from "@/src/types/api";
import { DecisionBar, DecisionButton } from "./ModerationKit";
import type { ModerationPalette, Translate } from "./theme";

interface ShopActionBarProps {
	/** Mirrors the server's `canActOn`; hides the affordance, not just the submit. */
	actionable: boolean;
	status: ShopStatus;
	suspendPending: boolean;
	liftPending: boolean;
	onSuspend: () => void;
	onLift: () => void;
	/** Kept for callers; the bar reads the shared palette itself. */
	c?: ModerationPalette;
	t: Translate;
}

/**
 * Bottom bar: suspend, lift, or an explanation when neither applies.
 * Suspending only opens the reason sheet, so it is an outline here and the
 * red fill is saved for that sheet's confirm.
 */
export function ShopActionBar({
	actionable,
	status,
	suspendPending,
	liftPending,
	onSuspend,
	onLift,
	t,
}: ShopActionBarProps) {
	if (!actionable) {
		return <DecisionBar note={{ text: t("moderation.cannotActOnShop") }} />;
	}
	if (status === "suspended") {
		return (
			<DecisionBar>
				<DecisionButton
					variant="approve"
					icon="lock-open-outline"
					label={t("moderation.shopLift")}
					onPress={onLift}
					pending={liftPending}
				/>
			</DecisionBar>
		);
	}
	if (status === "active") {
		return (
			<DecisionBar>
				<DecisionButton
					variant="dangerOutline"
					icon="ban-outline"
					label={t("moderation.shopSuspend")}
					onPress={onSuspend}
					disabled={suspendPending}
				/>
			</DecisionBar>
		);
	}
	return <DecisionBar note={{ text: t("moderation.shopClosedNote") }} />;
}
