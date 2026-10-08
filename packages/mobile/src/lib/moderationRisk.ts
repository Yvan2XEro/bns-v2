import type { RiskFlagDecisionInput } from "../../../api/src/types/riskModeration";

export function riskDismissalDecision(
	note: string,
): RiskFlagDecisionInput | null {
	const normalizedNote = note.trim();
	if (!normalizedNote) return null;
	return {
		outcome: "dismissed",
		resolution: "false_positive",
		note: normalizedNote,
	};
}

type RiskSanctionType = "suspend_user" | "suspend_shop" | "hold_payouts";

export function riskSanctionDecision(
	type: RiskSanctionType,
	targetId: string,
	durationDays: number | null,
	note: string,
): RiskFlagDecisionInput | null {
	const normalizedNote = note.trim();
	if (!targetId || !normalizedNote) return null;

	if (type === "suspend_user") {
		return {
			outcome: "actioned",
			resolution: "user_suspended",
			note: normalizedNote,
			action: { type, targetId, reason: "fraud", durationDays },
		};
	}
	if (type === "suspend_shop") {
		return {
			outcome: "actioned",
			resolution: "shop_suspended",
			note: normalizedNote,
			action: { type, targetId, reason: "fraud", durationDays },
		};
	}
	return {
		outcome: "actioned",
		resolution: "payouts_held",
		note: normalizedNote,
		action: { type, targetId, reason: "moderation", durationDays },
	};
}
