import type { DisputeRequestedOutcome } from "../../../api/src/contracts/disputes";

type RequestedOutcome = DisputeRequestedOutcome;

type RequestedAmountResult =
	| { valid: true; amount?: number }
	| { valid: false; reason: "required" | "invalid" | "over_limit" };

export function requestedDisputeAmount(
	outcome: RequestedOutcome,
	rawAmount: string,
	ceiling: number,
): RequestedAmountResult {
	if (outcome !== "partial_refund") return { valid: true };
	if (!rawAmount.trim()) return { valid: false, reason: "required" };
	const amount = Number(rawAmount);
	if (!Number.isSafeInteger(amount) || amount <= 0) {
		return { valid: false, reason: "invalid" };
	}
	if (amount > ceiling) return { valid: false, reason: "over_limit" };
	return { valid: true, amount };
}
