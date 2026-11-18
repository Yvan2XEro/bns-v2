import { z } from "zod";
import { ERROR_CODES } from "./apiError";
import { E164_PATTERN } from "./phone-input";

/**
 * Derives a remaining-seconds count from an absolute server timestamp rather
 * than a tick counter, so it stays correct across a remount and a
 * backgrounded tab — the caller only needs to re-render on an interval, not
 * track elapsed time itself. Mirrors `packages/mobile/src/lib/countdown.ts`.
 */
export function secondsUntil(iso: null | string, now = Date.now()): number {
	if (!iso) return 0;
	const target = Date.parse(iso);
	if (Number.isNaN(target)) return 0;
	return Math.max(0, Math.ceil((target - now) / 1000));
}

export function formatCountdown(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * `PhoneInput` only ever emits `E164_PATTERN`'s shape or `""`, so this
 * rejects nothing the server would accept and accepts nothing the server
 * would reject — a malformed number is caught in the field, before any
 * request.
 */
export const phoneNumberSchema = z.object({
	phone: z.string().regex(E164_PATTERN),
});
export type PhoneNumberValues = z.infer<typeof phoneNumberSchema>;

export const verificationCodeSchema = z.object({
	code: z
		.string()
		.trim()
		.regex(/^\d{6}$/),
});
export type VerificationCodeValues = z.infer<typeof verificationCodeSchema>;

/**
 * Codes returned by `POST /api/account/phone/verify` that belong on the code
 * field rather than as a page-level banner — an expired code and a wrong one
 * read differently to the seller, and "too many attempts" still needs a way
 * forward (a resend), not a dead form.
 */
export const CODE_FIELD_ERROR_CODES: ReadonlySet<string> = new Set([
	ERROR_CODES.phoneCodeInvalid,
	ERROR_CODES.phoneCodeExpired,
	ERROR_CODES.phoneTooManyAttempts,
]);
