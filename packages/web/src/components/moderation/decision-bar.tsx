import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import type { DecisionAction } from "~/lib/verification-decision";

const VARIANT: Record<DecisionAction, "default" | "outline" | "destructive"> = {
	claim: "default",
	release: "outline",
	request_info: "outline",
	approve: "default",
	reject: "destructive",
	revoke: "destructive",
};

/** The decisions this viewer may take right now, as a sticky action bar. */
export function DecisionBar({
	actions,
	pending,
	approveDisabled,
	onSelect,
}: {
	actions: DecisionAction[];
	pending: boolean;
	approveDisabled?: boolean;
	onSelect: (action: DecisionAction) => void;
}) {
	const t = useTranslations("Moderation");

	if (actions.length === 0) return null;

	return (
		<div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-[#E2E8F0] border-t bg-white/95 px-4 py-3 backdrop-blur">
			{actions.map((action) => (
				<Button
					key={action}
					type="button"
					variant={VARIANT[action]}
					disabled={pending || (action === "approve" && approveDisabled)}
					title={
						action === "approve" && approveDisabled
							? t("review.decisionBar.checklistIncomplete")
							: undefined
					}
					onClick={() => onSelect(action)}
				>
					{t(`review.action.${action}`)}
				</Button>
			))}
		</div>
	);
}
