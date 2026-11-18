import type { ReturnCaseView } from "../../../api/src/contracts/returns";

export type ReturnFlowStep =
	| "requested"
	| "shipping"
	| "inspection"
	| "refund"
	| "complete";

export interface ReturnFlowState {
	step: ReturnFlowStep;
	nextDeadline: string | null;
	remainingMs: number | null;
	deductionResponseRemainingMs: number | null;
	returnShippingPaidBy: ReturnCaseView["returnShippingPaidBy"];
	actions: ReturnCaseView["allowedActions"];
}

const FLOW_STEPS: Record<ReturnCaseView["status"], ReturnFlowStep> = {
	requested: "requested",
	approved: "shipping",
	awaiting_shipment: "shipping",
	in_transit: "shipping",
	received: "inspection",
	inspected: "refund",
	disputed: "refund",
	refund_pending: "refund",
	refunded: "complete",
	closed: "complete",
	rejected: "complete",
	cancelled: "complete",
	expired: "complete",
};

function remainingUntil(deadline: string | null, now: number): number | null {
	if (!deadline) return null;
	const timestamp = Date.parse(deadline);
	return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

export function returnFlowState(
	view: ReturnCaseView,
	now = new Date(),
): ReturnFlowState {
	const deadlines = [
		view.deadlines.shipBy,
		view.deadlines.pickupBy,
		view.deadlines.inspectBy,
		view.deadlines.deductionRespondBy,
		view.deadlines.refundBy,
	]
		.filter((deadline): deadline is string => deadline !== null)
		.filter((deadline) => Date.parse(deadline) >= now.getTime())
		.sort((left, right) => Date.parse(left) - Date.parse(right));
	const nextDeadline = deadlines[0] ?? null;
	return {
		step: FLOW_STEPS[view.status],
		nextDeadline,
		remainingMs: remainingUntil(nextDeadline, now.getTime()),
		deductionResponseRemainingMs: view.allowedActions.some(
			(action) =>
				action === "accept_deduction" || action === "contest_deduction",
		)
			? remainingUntil(view.deadlines.deductionRespondBy, now.getTime())
			: null,
		returnShippingPaidBy: view.returnShippingPaidBy,
		actions: view.allowedActions,
	};
}
