import type { PaymentIntent } from "../payload-types";

export type IntentStatus = PaymentIntent["status"];

const ALLOWED: Record<IntentStatus, readonly IntentStatus[]> = {
	created: ["pending", "failed", "cancelled"],
	pending: ["succeeded", "failed", "cancelled", "expired"],
	succeeded: [],
	failed: [],
	cancelled: [],
	expired: [],
};

export function canTransition(from: IntentStatus, to: IntentStatus): boolean {
	return ALLOWED[from].includes(to);
}

export function isTerminal(status: IntentStatus): boolean {
	return ALLOWED[status].length === 0;
}

/** The statuses to record to reach `to`; empty when the report must not move the intent. */
export function transitionPath(
	from: IntentStatus,
	to: IntentStatus,
): IntentStatus[] {
	if (from === to) return [];
	if (canTransition(from, to)) return [to];
	if (from === "created" && canTransition("pending", to))
		return ["pending", to];
	return [];
}
