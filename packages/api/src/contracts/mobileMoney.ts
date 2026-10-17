/**
 * Cameroon's mobile money operators: which one a number belongs to, and the
 * USSD menu where a payment is validated when the push prompt never arrives.
 */
export type MobileMoneyChannel = "cm.mtn" | "cm.orange";

export const MOBILE_MONEY_USSD: Record<MobileMoneyChannel, string> = {
	"cm.mtn": "*126#",
	"cm.orange": "#150#",
};

/**
 * National numbering plan, by the first three digits of the nine-digit
 * national number: MTN 650-654, 67x, 680-684; Orange 655-659, 69x, 685-689.
 */
export function operatorFromPhone(phone: string): MobileMoneyChannel | null {
	let digits = phone.replace(/\D/g, "");
	if (digits.startsWith("237") && digits.length === 12)
		digits = digits.slice(3);
	if (digits.length < 3 || digits[0] !== "6") return null;
	const prefix = Number(digits.slice(0, 3));
	if (prefix >= 670 && prefix <= 679) return "cm.mtn";
	if (prefix >= 690 && prefix <= 699) return "cm.orange";
	if ((prefix >= 650 && prefix <= 654) || (prefix >= 680 && prefix <= 684))
		return "cm.mtn";
	if ((prefix >= 655 && prefix <= 659) || (prefix >= 685 && prefix <= 689))
		return "cm.orange";
	return null;
}

/** A `tel:` link that opens the operator's validation menu in the dialer. */
export function ussdDialUrl(channel: MobileMoneyChannel): string {
	return `tel:${encodeURIComponent(MOBILE_MONEY_USSD[channel])}`;
}
