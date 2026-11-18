/**
 * Inline guards for the resolve sheet. They mirror the server's refusal ladder
 * in `disputeModeration.resolveDispute` so a moderator sees a refusal before
 * submitting; the server stays the enforcer and its error codes still win.
 * The money breakdown is never computed here: the `preview` action owns it.
 */

export type ResolveOutcome =
	| "resolved_buyer"
	| "resolved_seller"
	| "resolved_split";

export type DecisionGuard =
	| "refund_invalid"
	| "refund_out_of_bounds"
	| "admin_required"
	| "override_required"
	| "return_payer_required"
	| "statement_required"
	| "note_required";

export const LIABLE_PARTIES = [
	"seller",
	"supplier",
	"reseller",
	"courier",
	"buyer",
	"none",
] as const;
export const REASON_CODES = [
	"seller_no_proof",
	"delivery_proven",
	"item_conforms",
	"item_not_conforming",
	"counterfeit_confirmed",
	"counterfeit_not_established",
	"damage_in_transit",
	"buyer_damage",
	"buyer_abuse",
	"review_extortion",
	"partial_fault",
	"agreement",
	"other",
] as const;
export const RESOLVE_OUTCOMES = [
	"resolved_buyer",
	"resolved_seller",
	"resolved_split",
] as const;

/** Same three codes and 50-character floor as `resolvedSellerNeedsOverride`. */
export const OVERRIDE_REASON_CODES: readonly string[] = [
	"buyer_abuse",
	"item_conforms",
	"delivery_proven",
];
export const OVERRIDE_NOTE_MIN_LENGTH = 50;
/** The default `maxInfoRequests`; display only, the server refuses past the configured cap. */
export const DEFAULT_MAX_INFO_REQUESTS = 2;

export interface DecisionSheet {
	amountAtStake: number;
	moderatorRefundLimit: number;
	proofEstablished: boolean;
	viewerIsAdmin: boolean;
}

export interface DecisionInput {
	outcome: ResolveOutcome;
	refund: string;
	reasonCode: string;
	returnRequired: boolean;
	returnShippingPaidBy: "seller" | "buyer" | null;
	statementFr: string;
	statementEn: string;
	note: string;
}

export interface DecisionGuards {
	refundAmount: number | null;
	bounds: { min: number; max: number };
	guards: DecisionGuard[];
	adminOnly: boolean;
	overrideRequired: boolean;
	canPreview: boolean;
}

export function refundBounds(
	outcome: ResolveOutcome,
	amountAtStake: number,
): { min: number; max: number } {
	if (outcome === "resolved_seller") return { min: 0, max: 0 };
	if (outcome === "resolved_buyer") return { min: 1, max: amountAtStake };
	return { min: 1, max: amountAtStake - 1 };
}

export function parseRefund(raw: string): number | null {
	const text = raw.trim();
	if (!/^\d+$/.test(text)) return null;
	const value = Number(text);
	return Number.isSafeInteger(value) ? value : null;
}

export function decisionGuards(
	sheet: DecisionSheet,
	input: DecisionInput,
): DecisionGuards {
	const refundAmount = parseRefund(input.refund);
	const bounds = refundBounds(input.outcome, sheet.amountAtStake);
	const guards: DecisionGuard[] = [];
	if (refundAmount === null) guards.push("refund_invalid");
	else if (refundAmount < bounds.min || refundAmount > bounds.max)
		guards.push("refund_out_of_bounds");

	const adminOnly =
		refundAmount !== null && refundAmount > sheet.moderatorRefundLimit;
	if (adminOnly && !sheet.viewerIsAdmin) guards.push("admin_required");

	const overrideRequired =
		input.outcome === "resolved_seller" && !sheet.proofEstablished;
	if (
		overrideRequired &&
		!(
			OVERRIDE_REASON_CODES.includes(input.reasonCode) &&
			input.note.trim().length >= OVERRIDE_NOTE_MIN_LENGTH
		)
	)
		guards.push("override_required");

	if (input.returnRequired && input.returnShippingPaidBy === null)
		guards.push("return_payer_required");
	if (!input.statementFr.trim() || !input.statementEn.trim())
		guards.push("statement_required");
	if (!input.note.trim()) guards.push("note_required");

	const previewBlockers: DecisionGuard[] = [
		"refund_invalid",
		"refund_out_of_bounds",
	];
	return {
		refundAmount,
		bounds,
		guards,
		adminOnly,
		overrideRequired,
		canPreview: !guards.some((g) => previewBlockers.includes(g)),
	};
}

/** A preview is only good for the amount it was computed for. */
export function previewIsCurrent(
	previewedAmount: number | null,
	refundAmount: number | null,
): boolean {
	return previewedAmount !== null && previewedAmount === refundAmount;
}

export function canResolve(
	guards: DecisionGuards,
	previewedAmount: number | null,
): boolean {
	return (
		guards.guards.length === 0 &&
		previewIsCurrent(previewedAmount, guards.refundAmount)
	);
}

export function infoRequestState(
	messages: ReadonlyArray<{ kind: string }>,
	cap: number = DEFAULT_MAX_INFO_REQUESTS,
): { used: number; cap: number; exhausted: boolean } {
	const used = messages.filter((m) => m.kind === "info_request").length;
	return { used, cap, exhausted: used >= cap };
}
