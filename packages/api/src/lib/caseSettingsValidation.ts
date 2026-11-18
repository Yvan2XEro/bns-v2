import {
	disputeSettingsOf,
	filedCaseGates,
	RETURN_DEFAULTS,
	returnSettingsOf,
} from "./caseSettings";
import { isRecord } from "./payments/types";

const recordOf = (value: unknown): Record<string, unknown> =>
	isRecord(value) && !Array.isArray(value) ? value : {};

export function caseSettingsRefusal(
	returnsRaw: unknown,
	disputesRaw: unknown,
	ordersWithdrawalDays: number,
): string | null {
	const reasons: string[] = [];
	const returns = returnSettingsOf(returnsRaw);
	const disputes = disputeSettingsOf(disputesRaw);
	const filed = filedCaseGates(disputes.gates);
	const minimum = RETURN_DEFAULTS.refundDays;
	const belowMinimum: string[] = [];
	if (ordersWithdrawalDays < minimum)
		belowMinimum.push(`orders.withdrawalDays (${ordersWithdrawalDays})`);
	if (returns.refundDays < minimum)
		belowMinimum.push(`returns.refundDays (${returns.refundDays})`);
	if (belowMinimum.length > 0 && !filed.has("G1")) {
		reasons.push(
			`${belowMinimum.join(" and ")} cannot be set below ${minimum} days until the gate record holds evidence for G1.`,
		);
	}
	if (disputes.enabled) {
		const missing = (["G2", "G3"] as const).filter((id) => !filed.has(id));
		if (missing.length > 0)
			reasons.push(
				`Disputes cannot be enabled until the gate record holds evidence for ${missing.join(", ")}.`,
			);
	}
	if (
		(disputes.strikeEffectsEnabled || disputes.sellerLossFee > 0) &&
		!filed.has("G4")
	)
		reasons.push(
			"strikeEffectsEnabled and sellerLossFee > 0 cannot be set until the gate record holds evidence for G4.",
		);
	return reasons.length > 0 ? reasons.join(" ") : null;
}

// Payload may save only changed groups; validate the resulting document,
// including retained flags when their gate rows are removed.
export function validateCaseSettings<T>({
	data,
	originalDoc,
}: {
	data: T;
	originalDoc?: unknown;
}): T {
	const stored = recordOf(originalDoc);
	const incoming = recordOf(data);
	const returns = {
		...recordOf(stored.returns),
		...recordOf(incoming.returns),
	};
	const disputes = {
		...recordOf(stored.disputes),
		...recordOf(incoming.disputes),
	};
	const orders = { ...recordOf(stored.orders), ...recordOf(incoming.orders) };
	const withdrawalDays =
		typeof orders.withdrawalDays === "number"
			? orders.withdrawalDays
			: RETURN_DEFAULTS.refundDays;
	const refusal = caseSettingsRefusal(returns, disputes, withdrawalDays);
	if (refusal) throw new Error(refusal);
	return data;
}
