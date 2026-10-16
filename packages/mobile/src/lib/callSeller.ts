import { ERROR_CODES, hasErrorCode } from "./apiError";

/** Spaces and dashes are kept out of the URI; `+` and digits are what dialers read. */
export function phoneDialUrl(phone: string): string {
	return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** The reveal's answer when the seller shared no number: the button goes away. */
export function sellerHasNoPhone(error: unknown): boolean {
	return hasErrorCode(error, ERROR_CODES.contactPhoneUnavailable);
}
