import type { ReturnAction } from "../../../api/src/contracts/returns";

const endpoints: Record<ReturnAction, string> = {
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
	upload_evidence: "evidence",
};

export function returnActionEndpoint(action: ReturnAction): string {
	return endpoints[action];
}
