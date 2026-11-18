/**
 * Display-only vocabulary for P6's return cases and disputes: which `returns.* / disputes.*` translation key a screen shows for each server value.
 * Explicit literals on purpose (fully qualified, mobile calls `t()` without a namespace); a key built at runtime is invisible to the key scanners.
 * Web holds the same tables in `src/lib/case-status.ts`; `packages/api/tests/int/case-vocab-parity.int.spec.ts` holds both to the API's enums and to each other, cell for cell.
 */

export type ReturnCaseStatus =
	| "requested"
	| "approved"
	| "rejected"
	| "cancelled"
	| "awaiting_shipment"
	| "in_transit"
	| "received"
	| "inspected"
	| "disputed"
	| "refund_pending"
	| "refunded"
	| "closed"
	| "expired";

export type ReturnBasis =
	| "withdrawal"
	| "non_conformity"
	| "late_delivery"
	| "unavailable";

export type ReturnPayer = "buyer" | "seller";

export type InspectionOutcome =
	| "restock"
	| "damaged_by_buyer"
	| "damaged_in_transit"
	| "not_matching"
	| "missing";

export type RefundMethod = "cash" | "mtn_momo" | "orange_money";

export type ReturnAction =
	| "ship"
	| "pickup"
	| "receive"
	| "inspect"
	| "accept_deduction"
	| "contest_deduction"
	| "refund_proof"
	| "confirm_refund"
	| "contest_refund"
	| "cancel"
	| "upload_evidence";

export type DisputeStatus =
	| "open"
	| "awaiting_seller"
	| "awaiting_buyer"
	| "under_review"
	| "resolved_buyer"
	| "resolved_seller"
	| "resolved_split"
	| "withdrawn";

export type DisputeReason =
	| "not_received"
	| "not_as_described"
	| "damaged"
	| "counterfeit"
	| "wrong_item"
	| "seller_no_show"
	| "cod_refused_abuse";

export type DisputeOutcome =
	| "full_refund"
	| "partial_refund"
	| "return_and_refund"
	| "no_refund";

export type DisputeAction =
	| "submit"
	| "withdraw"
	| "escalate"
	| "respond_accept"
	| "proposal_accept"
	| "proposal_reject";

export const RETURN_CASE_STATUS_LABELS: Record<ReturnCaseStatus, string> = {
	requested: "returns.status.requested",
	approved: "returns.status.approved",
	rejected: "returns.status.rejected",
	cancelled: "returns.status.cancelled",
	awaiting_shipment: "returns.status.awaiting_shipment",
	in_transit: "returns.status.in_transit",
	received: "returns.status.received",
	inspected: "returns.status.inspected",
	disputed: "returns.status.disputed",
	refund_pending: "returns.status.refund_pending",
	refunded: "returns.status.refunded",
	closed: "returns.status.closed",
	expired: "returns.status.expired",
};

export const RETURN_BASIS_LABELS: Record<ReturnBasis, string> = {
	withdrawal: "returns.basis.withdrawal",
	non_conformity: "returns.basis.non_conformity",
	late_delivery: "returns.basis.late_delivery",
	unavailable: "returns.basis.unavailable",
};

export const RETURN_PAYER_LABELS: Record<ReturnPayer, string> = {
	buyer: "returns.payer.buyer",
	seller: "returns.payer.seller",
};

export const INSPECTION_OUTCOME_LABELS: Record<InspectionOutcome, string> = {
	restock: "returns.inspection.restock",
	damaged_by_buyer: "returns.inspection.damaged_by_buyer",
	damaged_in_transit: "returns.inspection.damaged_in_transit",
	not_matching: "returns.inspection.not_matching",
	missing: "returns.inspection.missing",
};

export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
	cash: "returns.refundMethodOptions.cash",
	mtn_momo: "returns.refundMethodOptions.mtn_momo",
	orange_money: "returns.refundMethodOptions.orange_money",
};

export const RETURN_ACTION_LABELS: Record<ReturnAction, string> = {
	ship: "returns.action.ship",
	pickup: "returns.action.pickup",
	receive: "returns.action.receive",
	inspect: "returns.action.inspect",
	accept_deduction: "returns.action.accept_deduction",
	contest_deduction: "returns.action.contest_deduction",
	refund_proof: "returns.action.refund_proof",
	confirm_refund: "returns.action.confirm_refund",
	contest_refund: "returns.action.contest_refund",
	cancel: "returns.action.cancel",
	upload_evidence: "returns.action.upload_evidence",
};

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
	open: "disputes.status.open",
	awaiting_seller: "disputes.status.awaiting_seller",
	awaiting_buyer: "disputes.status.awaiting_buyer",
	under_review: "disputes.status.under_review",
	resolved_buyer: "disputes.status.resolved_buyer",
	resolved_seller: "disputes.status.resolved_seller",
	resolved_split: "disputes.status.resolved_split",
	withdrawn: "disputes.status.withdrawn",
};

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
	not_received: "disputes.reason.not_received",
	not_as_described: "disputes.reason.not_as_described",
	damaged: "disputes.reason.damaged",
	counterfeit: "disputes.reason.counterfeit",
	wrong_item: "disputes.reason.wrong_item",
	seller_no_show: "disputes.reason.seller_no_show",
	cod_refused_abuse: "disputes.reason.cod_refused_abuse",
};

export const DISPUTE_OUTCOME_LABELS: Record<DisputeOutcome, string> = {
	full_refund: "disputes.outcome.full_refund",
	partial_refund: "disputes.outcome.partial_refund",
	return_and_refund: "disputes.outcome.return_and_refund",
	no_refund: "disputes.outcome.no_refund",
};

/** The six buttons the thread screens render; the API's other actions (message, upload_evidence, respond_propose, respond_contest) have their own controls. */
export const DISPUTE_ACTION_LABELS: Record<DisputeAction, string> = {
	submit: "disputes.action.submit",
	withdraw: "disputes.action.withdraw",
	escalate: "disputes.action.escalate",
	respond_accept: "disputes.action.respond_accept",
	proposal_accept: "disputes.action.proposal_accept",
	proposal_reject: "disputes.action.proposal_reject",
};
