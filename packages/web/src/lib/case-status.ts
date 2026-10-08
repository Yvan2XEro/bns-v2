/**
 * Display-only vocabulary for P6's return cases and disputes: which `Returns.* / Disputes.*` translation key a screen shows for each server value.
 * Explicit literals on purpose (namespace-relative to the map's own namespace); a key built at runtime is invisible to the key scanners.
 * Mobile holds the same tables in `src/lib/caseStatus.ts`; `packages/api/tests/int/case-vocab-parity.int.spec.ts` holds both to the API's enums and to each other, cell for cell.
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
	requested: "status.requested",
	approved: "status.approved",
	rejected: "status.rejected",
	cancelled: "status.cancelled",
	awaiting_shipment: "status.awaiting_shipment",
	in_transit: "status.in_transit",
	received: "status.received",
	inspected: "status.inspected",
	disputed: "status.disputed",
	refund_pending: "status.refund_pending",
	refunded: "status.refunded",
	closed: "status.closed",
	expired: "status.expired",
};

export const RETURN_BASIS_LABELS: Record<ReturnBasis, string> = {
	withdrawal: "basis.withdrawal",
	non_conformity: "basis.non_conformity",
	late_delivery: "basis.late_delivery",
	unavailable: "basis.unavailable",
};

export const RETURN_PAYER_LABELS: Record<ReturnPayer, string> = {
	buyer: "payer.buyer",
	seller: "payer.seller",
};

export const INSPECTION_OUTCOME_LABELS: Record<InspectionOutcome, string> = {
	restock: "inspection.restock",
	damaged_by_buyer: "inspection.damaged_by_buyer",
	damaged_in_transit: "inspection.damaged_in_transit",
	not_matching: "inspection.not_matching",
	missing: "inspection.missing",
};

export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
	cash: "refundMethodOptions.cash",
	mtn_momo: "refundMethodOptions.mtn_momo",
	orange_money: "refundMethodOptions.orange_money",
};

export const RETURN_ACTION_LABELS: Record<ReturnAction, string> = {
	ship: "action.ship",
	pickup: "action.pickup",
	receive: "action.receive",
	inspect: "action.inspect",
	accept_deduction: "action.accept_deduction",
	contest_deduction: "action.contest_deduction",
	refund_proof: "action.refund_proof",
	confirm_refund: "action.confirm_refund",
	contest_refund: "action.contest_refund",
	cancel: "action.cancel",
	upload_evidence: "action.upload_evidence",
};

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
	open: "status.open",
	awaiting_seller: "status.awaiting_seller",
	awaiting_buyer: "status.awaiting_buyer",
	under_review: "status.under_review",
	resolved_buyer: "status.resolved_buyer",
	resolved_seller: "status.resolved_seller",
	resolved_split: "status.resolved_split",
	withdrawn: "status.withdrawn",
};

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
	not_received: "reason.not_received",
	not_as_described: "reason.not_as_described",
	damaged: "reason.damaged",
	counterfeit: "reason.counterfeit",
	wrong_item: "reason.wrong_item",
	seller_no_show: "reason.seller_no_show",
	cod_refused_abuse: "reason.cod_refused_abuse",
};

export const DISPUTE_OUTCOME_LABELS: Record<DisputeOutcome, string> = {
	full_refund: "outcome.full_refund",
	partial_refund: "outcome.partial_refund",
	return_and_refund: "outcome.return_and_refund",
	no_refund: "outcome.no_refund",
};

/** The six buttons the thread screens render; the API's other actions (message, upload_evidence, respond_propose, respond_contest) have their own controls. */
export const DISPUTE_ACTION_LABELS: Record<DisputeAction, string> = {
	submit: "action.submit",
	withdraw: "action.withdraw",
	escalate: "action.escalate",
	respond_accept: "action.respond_accept",
	proposal_accept: "action.proposal_accept",
	proposal_reject: "action.proposal_reject",
};
