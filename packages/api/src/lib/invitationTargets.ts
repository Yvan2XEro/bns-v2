import { normalizePhoneNumber } from "../services/phoneVerification";
import { ERROR_CODES } from "./errors";
import { ServiceError } from "./serviceError";

export type InvitationChannel = "phone" | "email";

const BULLET = "•";
/** Deliberately permissive: an address the invitee controls is proved by the token, not by this. */
const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export function normalizeInvitationTarget(
	channel: InvitationChannel,
	raw: unknown,
): string {
	if (typeof raw !== "string" || raw.trim() === "") {
		throw new ServiceError(
			channel === "phone" ? ERROR_CODES.phoneInvalid : ERROR_CODES.invalidEmail,
			400,
		);
	}
	if (channel === "phone") {
		// Reuses the phone-verification normaliser, which throws
		// PhoneVerificationError (a ServiceError carrying phone.invalid).
		return normalizePhoneNumber(raw);
	}
	const email = raw.trim().toLowerCase();
	if (!EMAIL.test(email)) {
		throw new ServiceError(ERROR_CODES.invalidEmail, 400);
	}
	return email;
}

/**
 * No calling-code table is kept in the project, so the split between country
 * code and national number is inferred: try a 3-, then 2-, then 1-digit
 * prefix and keep the first that leaves a plausible 8- or 9-digit national
 * part (covers both a 3-digit code with a 9-digit national number, like
 * Cameroon, and a 2-digit code with an 8-digit one). Falls back to a 9-digit
 * national number for anything that fits no digit count a real plan uses.
 */
function splitCallingCode(digits: string): { cc: string; national: string } {
	for (const ccLength of [3, 2, 1]) {
		const nationalLength = digits.length - ccLength;
		if (nationalLength === 8 || nationalLength === 9) {
			return {
				cc: digits.slice(0, ccLength),
				national: digits.slice(ccLength),
			};
		}
	}
	const ccLength = Math.max(1, digits.length - 9);
	return { cc: digits.slice(0, ccLength), national: digits.slice(ccLength) };
}

/**
 * `+237612345421` becomes `+237 6•• •• •4 21`: country code, then the national
 * number with only its first and last three digits shown. The invitee
 * recognises their own number; nobody else learns one.
 *
 * A national number shorter than 9 digits uses a plainer template (first
 * digit, up to four bullets, last digit) rather than one bullet per hidden
 * digit, so the mask stays a bounded width instead of growing with the
 * number's length.
 */
export function maskPhone(e164: string): string {
	const digits = e164.replace(/\D/g, "");
	const { cc, national } = splitCallingCode(digits);
	if (national.length === 9) {
		return [
			`+${cc}`,
			`${national[0]}${BULLET}${BULLET}`,
			`${BULLET}${BULLET}`,
			`${BULLET}${national[6]}`,
			`${national[7]}${national[8]}`,
		].join(" ");
	}
	if (national.length < 2) {
		return `+${cc} ${BULLET.repeat(national.length)}`;
	}
	const hidden = Math.min(national.length - 2, 4);
	return `+${cc} ${national.slice(0, 1)}${BULLET.repeat(hidden)}${national.slice(-1)}`;
}

/** `alice@gmail.com` becomes `a•••@gmail.com`; the domain is not a secret. */
export function maskEmail(email: string): string {
	const at = email.lastIndexOf("@");
	if (at <= 0) return `${BULLET.repeat(3)}${email.slice(at)}`;
	const local = email.slice(0, at);
	const head = local.length > 1 ? local.slice(0, 1) : "";
	return `${head}${BULLET.repeat(3)}${email.slice(at)}`;
}

export function maskTarget(channel: InvitationChannel, target: string): string {
	return channel === "phone" ? maskPhone(target) : maskEmail(target);
}

/**
 * The value the partial unique index is built on. It exists as a stored field
 * rather than a compound index on `(shop, channel, phone, email)` because
 * Mongo's unique index would treat two missing `email`s as equal only under a
 * partial filter that cannot then also cover the phone rows.
 */
export function pendingKeyFor(
	shopId: string,
	channel: InvitationChannel,
	target: string,
): string {
	return `${shopId}:${channel}:${target}`;
}
