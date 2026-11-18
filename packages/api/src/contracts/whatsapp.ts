/**
 * WhatsApp links, the default channel between buyers and sellers in the
 * launch market. `wa.me` opens the app on a phone and WhatsApp Web elsewhere.
 */

/** Cameroon's calling code, prefixed to a number written the local way. */
export const DEFAULT_DIAL_CODE = "237";

/** A link that opens WhatsApp with the message prefilled, to pick a contact. */
export function whatsappShareUrl(message: string): string {
	return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * The international digits WhatsApp wants: no "+", spaces or "00", and the
 * calling code added to a local nine-digit number. Null when too short to dial.
 */
export function whatsappNumber(
	phone: string,
	dialCode: string = DEFAULT_DIAL_CODE,
): string | null {
	let digits = phone.replace(/\D/g, "");
	if (digits.startsWith("00")) digits = digits.slice(2);
	if (digits.length === 9 && !phone.trim().startsWith("+"))
		digits = `${dialCode}${digits}`;
	return digits.length >= 10 ? digits : null;
}

/** A chat with this number, the message prefilled. Null for an unusable number. */
export function whatsappChatUrl(
	phone: string,
	message?: string,
	dialCode?: string,
): string | null {
	const number = whatsappNumber(phone, dialCode);
	if (!number) return null;
	return message
		? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
		: `https://wa.me/${number}`;
}
