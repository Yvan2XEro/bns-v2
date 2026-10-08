import {
	DISPUTE_EVIDENCE_REQUIREMENTS,
	type DisputeReason,
} from "../../../api/src/contracts/disputes";

export function disputeEvidenceStatus(reason: DisputeReason, count: number) {
	const required = DISPUTE_EVIDENCE_REQUIREMENTS[reason];
	const remaining = Math.max(0, required - count);
	return { required, remaining, canSubmit: remaining === 0 };
}
