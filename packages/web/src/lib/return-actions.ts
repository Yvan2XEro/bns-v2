import type { ReturnAction } from "../../../api/src/contracts/returns";

export type JsonReturnAction = Exclude<ReturnAction, "upload_evidence">;

const ACTION_ROUTES: Record<JsonReturnAction, string> = {
	ship: "ship",
	pickup: "pickup",
	receive: "receive",
	inspect: "inspect",
	accept_deduction: "deduction",
	contest_deduction: "deduction",
	refund_proof: "refund-proof",
	confirm_refund: "confirm-refund",
	contest_refund: "contest-refund",
	cancel: "cancel",
};

export function returnActionRequest(
	action: JsonReturnAction,
	body: unknown,
): { endpoint: string; body: unknown } {
	if (action === "accept_deduction" || action === "contest_deduction") {
		return {
			endpoint: ACTION_ROUTES[action],
			body: { action: action === "accept_deduction" ? "accept" : "contest" },
		};
	}
	return { endpoint: ACTION_ROUTES[action], body };
}
