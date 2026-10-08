import type { ConnectedAccountStatus, PaymentFailureCode } from "./marketplace";
import type { ProviderPaymentStatus } from "./types";

/** ASSUMED(A3): the sandbox's account status vocabulary. */
export const ACCOUNT_STATUSES: Record<string, ConnectedAccountStatus> = {
	pending: "created",
	created: "created",
	onboarding: "onboarding",
	incomplete: "onboarding",
	restricted: "restricted",
	active: "active",
	disabled: "disabled",
	deauthorized: "deauthorized",
};

const FAILURE_MARKERS: [string, PaymentFailureCode][] = [
	["declin", "declined"],
	["insufficient", "insufficient_funds"],
	["timeout", "timeout"],
	["timed out", "timeout"],
	["limit", "limit_exceeded"],
	["invalid", "invalid_number"],
];

export function failureCodeOf(
	reason: string,
	status: ProviderPaymentStatus,
): PaymentFailureCode | null {
	const lower = reason.toLowerCase();
	for (const [marker, code] of FAILURE_MARKERS) {
		if (lower.includes(marker)) return code;
	}
	return status === "failed" ? "provider_error" : null;
}
