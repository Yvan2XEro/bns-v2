import { roundHalfUp, vatOf } from "./orderMath";

/**
 * `roundHalfUp` already rounds half-up for non-negative inputs, which is all
 * money ever is in XAF — re-exported under the name the payment spec uses,
 * not re-implemented.
 */
export const roundXaf = roundHalfUp;

/**
 * VAT on a commission amount is the same half-up extraction `orderMath`
 * already does for the invoice; re-exported rather than duplicated.
 */
export const commissionVatOf = vatOf;

export interface BuyerProtectionFeeConfig {
	bps: number;
	min: number;
	max: number;
}

/**
 * The buyer protection fee is TTC (VAT-inclusive): a percentage of the order
 * total, clamped to a market-configured floor and ceiling.
 */
export function buyerProtectionFee(
	orderTotal: number,
	{ bps, min, max }: BuyerProtectionFeeConfig,
): number {
	const raw = roundXaf((orderTotal * bps) / 10_000);
	return Math.min(Math.max(raw, min), max);
}

/**
 * The fee is collected TTC; this extracts the VAT portion for the ledger by
 * computing the HT base at the given rate and taking the remainder.
 */
export function buyerProtectionFeeVat(fee: number, vatRateBps: number): number {
	const ht = roundXaf((fee * 10_000) / (10_000 + vatRateBps));
	return fee - ht;
}

export interface SplitAmountsInput {
	orderTotal: number;
	commission: number;
	vatRateBps: number;
	protection: BuyerProtectionFeeConfig;
}

export interface SplitAmountsResult {
	commission: number;
	commissionVat: number;
	buyerProtectionFee: number;
	buyerProtectionFeeVat: number;
	applicationFee: number;
	destinationAmount: number;
	buyerTotal: number;
}

/**
 * The application fee (platform) and destination amount (seller) are fixed
 * XAF amounts, never percentages, so the ledger always balances exactly:
 * `applicationFee + destinationAmount === buyerTotal`.
 */
export function splitAmounts({
	orderTotal,
	commission,
	vatRateBps,
	protection,
}: SplitAmountsInput): SplitAmountsResult {
	const commissionVat = commissionVatOf(commission, vatRateBps);
	const fee = buyerProtectionFee(orderTotal, protection);
	const feeVat = buyerProtectionFeeVat(fee, vatRateBps);

	const applicationFee = commission + commissionVat + fee;
	const destinationAmount = orderTotal - commission - commissionVat;
	const buyerTotal = applicationFee + destinationAmount;

	return {
		commission,
		commissionVat,
		buyerProtectionFee: fee,
		buyerProtectionFeeVat: feeVat,
		applicationFee,
		destinationAmount,
		buyerTotal,
	};
}

export type PaymentChannel = "cm.mtn" | "cm.orange";

function prefixRange(start: number, end: number): string[] {
	const prefixes: string[] = [];
	for (let prefix = start; prefix <= end; prefix++) {
		prefixes.push(String(prefix));
	}
	return prefixes;
}

/**
 * Operator mobile-money prefixes, keyed by channel. This is the only place
 * in the repo allowed to know a prefix: a new market adds a row here, never
 * a hard-coded prefix elsewhere. Cameroon MTN: 650-654 and 670-684. Cameroon
 * Orange: 655-659 and 690-699 (ranges as of 2026).
 */
export const CHANNEL_PHONE_PREFIXES: Record<PaymentChannel, readonly string[]> =
	{
		"cm.mtn": [...prefixRange(650, 654), ...prefixRange(670, 684)],
		"cm.orange": [...prefixRange(655, 659), ...prefixRange(690, 699)],
	};

/**
 * Accepts a Cameroon mobile number with or without the `+237`/`237` country
 * code and returns its 9-digit local form, or `null` if it isn't a 9-digit
 * number once the country code is stripped.
 */
function cmLocalNumber(phone: string): string | null {
	let digits = phone.replace(/[^\d]/g, "");
	if (digits.startsWith("237") && digits.length > 9) {
		digits = digits.slice(3);
	}
	return /^\d{9}$/.test(digits) ? digits : null;
}

export function phoneMatchesChannel(
	phone: string,
	channel: PaymentChannel,
): boolean {
	const local = cmLocalNumber(phone);
	if (!local) return false;
	const prefix = local.slice(0, 3);
	return CHANNEL_PHONE_PREFIXES[channel].includes(prefix);
}
