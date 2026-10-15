import type { CaseBasis } from "../contracts/caseRules";
import {
	type LocalDay,
	localDateAt,
	localParts,
	shiftDays,
} from "./marketTime";
import { vatOf } from "./orderMath";
import { roundMinor } from "./paymentMath";

export {
	type CaseBasis,
	type DeductionAllowedInput,
	type DeductionAllowedResult,
	deductionAllowed,
} from "../contracts/caseRules";

export interface CaseBreakdown {
	goods: number;
	outboundDelivery: number;
	returnShipping: number;
	buyerProtectionFee: number;
	deduction: number;
	amount: number;
}

export interface CaseBreakdownSettings {
	refundOutboundDeliveryOnWithdrawal: boolean;
	maxReturnShippingReimbursement: number;
}

export interface CaseBreakdownInput {
	basis: CaseBasis;
	goods: number;
	fullOrder: boolean;
	orderDeliveryFee: number;
	documentedReturnShipping: number;
	returnShippingPaidBy: "seller" | "buyer" | null;
	/**
	 * Pass 0 for COD orders; the caller knows whether the order is protected.
	 */
	buyerProtectionFee: number;
	deduction: number;
	settings: CaseBreakdownSettings;
}

const OUTBOUND_DELIVERY_BASES: ReadonlySet<CaseBasis> = new Set([
	"non_conformity",
	"late_delivery",
	"unavailable",
]);

/**
 * Output goods are net of deduction, so the refund sums the four components
 * without subtracting the deduction a second time.
 */
export function caseBreakdown({
	basis,
	goods,
	fullOrder,
	orderDeliveryFee,
	documentedReturnShipping,
	returnShippingPaidBy,
	buyerProtectionFee,
	deduction,
	settings,
}: CaseBreakdownInput): CaseBreakdown {
	const netGoods = goods - deduction;

	const outboundDeliveryEligible =
		fullOrder &&
		(OUTBOUND_DELIVERY_BASES.has(basis) ||
			(basis === "withdrawal" && settings.refundOutboundDeliveryOnWithdrawal));
	const outboundDelivery = outboundDeliveryEligible ? orderDeliveryFee : 0;

	const returnShipping =
		returnShippingPaidBy === "seller"
			? Math.min(
					documentedReturnShipping,
					settings.maxReturnShippingReimbursement,
				)
			: 0;

	const fee = fullOrder ? buyerProtectionFee : 0;

	const amount = netGoods + outboundDelivery + returnShipping + fee;

	return {
		goods: netGoods,
		outboundDelivery,
		returnShipping,
		buyerProtectionFee: fee,
		deduction,
		amount,
	};
}

export interface SplitAllocationInput {
	refundAmount: number;
	goods: number;
	orderDeliveryFee: number;
}

export interface SplitAllocationResult {
	goods: number;
	outboundDelivery: number;
	buyerProtectionFee: 0;
}

/**
 * A moderator's split decision allocates to goods first, then delivery,
 * never to the protection fee — the spec's explicit ordering.
 */
export function splitAllocation({
	refundAmount,
	goods,
	orderDeliveryFee,
}: SplitAllocationInput): SplitAllocationResult {
	if (refundAmount > goods + orderDeliveryFee) {
		throw new Error(
			"splitAllocation: refundAmount exceeds goods + orderDeliveryFee",
		);
	}
	const toGoods = Math.min(refundAmount, goods);
	const toDelivery = refundAmount - toGoods;
	return {
		goods: toGoods,
		outboundDelivery: toDelivery,
		buyerProtectionFee: 0,
	};
}

export interface CommissionCreditInput {
	commissionHt: number;
	refundedGoods: number;
	commissionBase: number;
	vatRateBps: number;
}

export interface CommissionCreditResult {
	creditHt: number;
	creditVat: number;
	creditTtc: number;
}

/**
 * The commission credit for a partial or full refund, pro-rated on the
 * refunded share of goods. VAT uses the invoice's own rate, never a fresh
 * country constant.
 */
export function commissionCredit({
	commissionHt,
	refundedGoods,
	commissionBase,
	vatRateBps,
}: CommissionCreditInput): CommissionCreditResult {
	const creditHt = roundMinor(
		(commissionHt * refundedGoods) / commissionBase,
		"half_up",
	);
	const creditVat = vatOf(creditHt, vatRateBps);
	return { creditHt, creditVat, creditTtc: creditHt + creditVat };
}

/**
 * `days` business days (Monday-Friday on the order's market calendar) after
 * `start`, preserving the local time of day. Weekends are skipped entirely,
 * so a count starting on or just before one rolls over to the following Monday.
 */
export function businessDaysAfter(
	start: Date,
	days: number,
	timezone: string,
): Date {
	if (days <= 0) return new Date(start);
	const from = localParts(start, timezone);
	let day: LocalDay = { year: from.year, month: from.month, day: from.day };
	let remaining = days;
	while (remaining > 0) {
		day = shiftDays(day, 1);
		const weekday = localParts(
			localDateAt(day, 12, 0, timezone),
			timezone,
		).weekday;
		if (weekday !== "sat" && weekday !== "sun") remaining--;
	}
	const sameMinute = localDateAt(day, from.hour, from.minute, timezone);
	return new Date(sameMinute.getTime() + (start.getTime() % 60_000));
}
