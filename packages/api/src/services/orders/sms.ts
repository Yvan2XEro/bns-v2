import type { Payload } from "payload";
import { formatXaf } from "../../lib/orderFormat";
import { sendSms } from "../smsProvider";

/** `^ { } [ ] ~ \ |` and `€` are GSM-7 escape sequences and count twice;
 * everything else in the basic GSM-7 alphabet counts once. The four
 * builders below are written in unaccented French precisely so an accent
 * never forces the whole message to UCS-2, which would halve the 160-char
 * budget to 70 (`syncNotificationWorkflows.ts` already relies on the same
 * trick). */
const GSM7_EXTENDED_CHARS = new Set([
	"^",
	"{",
	"}",
	"[",
	"]",
	"~",
	"\\",
	"|",
	"€",
]);

/**
 * The GSM 03.38 basic alphabet. A character outside it (an accent, a curly
 * quote, an ellipsis) forces the whole message to UCS-2, where a part holds
 * 70 characters instead of 160 — so one stray `é` turns a one-part message
 * into three. That is why the French texts below are written without
 * accents, and why `gsm7Length` refuses to measure text it cannot encode
 * rather than returning a number that reads as safe.
 */
const GSM7_BASIC = new Set(
	"@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u00c6\u00e6\u00df\u00c9 !\"#\u00a4%&'()*+,-./0123456789:;<=>?\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc\u00a7\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0",
);

/**
 * `formatXaf` groups thousands with U+202F, the narrow no-break space French
 * typography wants. It is not in GSM-7, so an amount alone was enough to push
 * every message carrying one into UCS-2 — 70 characters a part. The receipt
 * measured 152 and was really three SMS. Every amount that goes into an SMS
 * comes through here first.
 */
function gsmAmount(value: number, locale: "fr" | "en"): string {
	return formatXaf(value, locale).replace(/[\u202f\u00a0]/g, " ");
}

export function isGsm7(text: string): boolean {
	for (const char of text) {
		if (!GSM7_BASIC.has(char) && !GSM7_EXTENDED_CHARS.has(char)) return false;
	}
	return true;
}

export function gsm7Length(text: string): number {
	let length = 0;
	for (const char of text) {
		if (!GSM7_BASIC.has(char) && !GSM7_EXTENDED_CHARS.has(char)) {
			throw new Error(
				`not GSM-7 encodable: ${JSON.stringify(char)} — this message would be sent as UCS-2, at 70 characters a part`,
			);
		}
		length += GSM7_EXTENDED_CHARS.has(char) ? 2 : 1;
	}
	return length;
}

/** One GSM-7 part. Past this a message is billed twice and may arrive split. */
const SMS_BUDGET = 160;

/** Sent to the delivery phone right after the order is placed. Carries no
 * code: it is an acknowledgement, not a credential — which is why the shop
 * name is the part that gives way when the message does not fit.
 *
 * It has to give way often. The French text with a nine-character name is
 * already 152 of the 160 available, so "Boutique Mama Ngono" — an entirely
 * ordinary name here — pushed it to 162 and split every receipt that shop
 * ever sent. Billed twice, on every order. */
export function receiptSms(
	input: { orderNumber: string; shopName: string; total: number },
	locale: "fr" | "en",
): string {
	const build = (shopName: string) =>
		locale === "fr"
			? `BuyNSellem: commande ${input.orderNumber} recue chez ${shopName}, total ${gsmAmount(input.total, "fr")} a payer a la livraison. Suivi: buynsellem.com/purchases/${input.orderNumber}.`
			: `BuyNSellem: order ${input.orderNumber} received from ${shopName}, total ${gsmAmount(input.total, "en")} due on delivery. Track: buynsellem.com/purchases/${input.orderNumber}.`;

	const full = build(input.shopName);
	const overflow = gsm7Length(full) - SMS_BUDGET;
	if (overflow <= 0) return full;

	// Trim the name by the overflow plus the ellipsis it gains. Never below a
	// few characters: a receipt naming no recognisable shop is worse than a
	// long one, and the order number identifies it regardless.
	const keep = Math.max(6, input.shopName.length - overflow - 1);
	return build(`${input.shopName.slice(0, keep).trimEnd()}.`);
}

/** Sent to the delivery phone when the buyer's number is not their own
 * verified account phone, so placement cannot auto-confirm. */
export function confirmationCodeSms(
	input: { orderNumber: string; code: string },
	locale: "fr" | "en",
): string {
	return locale === "fr"
		? `BuyNSellem: code de confirmation ${input.code} pour la commande ${input.orderNumber}. Ne le communiquez qu'a l'application.`
		: `BuyNSellem: confirmation code ${input.code} for order ${input.orderNumber}. Share it only inside the app.`;
}

/** Sent on ship and on regenerate. The anti-scam line is deliberate: a
 * courier who asks for the code before handing over the parcel is not the
 * platform's courier. */
export function handoverCodeSms(
	input: { orderNumber: string; code: string; total: number },
	locale: "fr" | "en",
): string {
	return locale === "fr"
		? `BuyNSellem: votre commande ${input.orderNumber} est en route. Donnez le code ${input.code} au livreur uniquement a la remise du colis. Montant a payer: ${gsmAmount(input.total, "fr")}.`
		: `BuyNSellem: order ${input.orderNumber} is on its way. Give code ${input.code} to the courier only when you receive the parcel. To pay: ${gsmAmount(input.total, "en")}.`;
}

/** Fallback to the shop's business phone (or its owner's) when no member
 * has a push token registered. Carries no code: a seller accepts or
 * declines in the app, never by replying to an SMS. */
export function sellerNewOrderSms(
	input: { orderNumber: string; total: number },
	locale: "fr" | "en",
): string {
	return locale === "fr"
		? `BuyNSellem: nouvelle commande ${input.orderNumber}, total ${gsmAmount(input.total, "fr")}. Acceptez-la dans l'application sous 48h.`
		: `BuyNSellem: new order ${input.orderNumber}, total ${gsmAmount(input.total, "en")}. Accept it in the app within 48h.`;
}

/**
 * An SMS failure must never roll back a delivery: this reports `{ sent:
 * false }` instead of throwing, and `dispatchOrderEvent` (P4 Task 8) retries
 * on that signal rather than on a caught exception.
 */
export async function sendOrderSms(
	payload: Payload,
	message: { to: string; text: string },
): Promise<{ sent: boolean }> {
	try {
		await sendSms(payload, { to: message.to, message: message.text });
		return { sent: true };
	} catch (error) {
		payload.logger.error(
			{ err: error, to: message.to },
			"[orders] sms delivery failed; the order keeps moving without it",
		);
		return { sent: false };
	}
}
