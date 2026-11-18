import type { PayloadRequest } from "payload";
import type { RiskSignalOutbox } from "../payload-types";

export type RiskSignal = RiskSignalOutbox["signal"];
export type RiskSignalSeverity = RiskSignalOutbox["severity"];

export const RISK_SIGNAL_SEVERITY = {
	dispute_lost_seller: "medium",
	counterfeit_confirmed: "high",
	refund_overdue: "high",
	seller_no_response: "low",
	unavailable_after_confirmation: "low",
	dispute_abuse_buyer: "medium",
	cod_refusal_abuse: "medium",
	serial_withdrawal: "low",
	evidence_reused: "medium",
	review_extortion: "medium",
	resale_collusion_suspected: "high",
	commission_credit_unpaid: "medium",
} satisfies Record<RiskSignal, RiskSignalSeverity>;

export function riskSignalSeverity(signal: RiskSignal): RiskSignalSeverity {
	return RISK_SIGNAL_SEVERITY[signal];
}

export interface RecordRiskSignalInput {
	subjectType: RiskSignalOutbox["subjectType"];
	subjectId: string;
	signal: RiskSignal;
	sourceType: RiskSignalOutbox["sourceType"];
	sourceId: string;
	occurredAt?: Date | string;
}

/** Write in the caller's transaction so a failed domain change emits no signal. */
export async function recordRiskSignal(
	req: PayloadRequest,
	input: RecordRiskSignalInput,
): Promise<RiskSignalOutbox> {
	return req.payload.create({
		collection: "risk-signal-outbox",
		req,
		overrideAccess: true,
		data: {
			subjectType: input.subjectType,
			subjectId: input.subjectId,
			signal: input.signal,
			severity: riskSignalSeverity(input.signal),
			sourceType: input.sourceType,
			sourceId: input.sourceId,
			occurredAt: input.occurredAt
				? new Date(input.occurredAt).toISOString()
				: new Date().toISOString(),
		},
	});
}
