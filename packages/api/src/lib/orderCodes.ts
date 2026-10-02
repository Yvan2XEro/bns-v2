import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const CONFIRMATION_CODE_LENGTH = 6;
export const HANDOVER_CODE_LENGTH = 4;
export const CONFIRMATION_MAX_ATTEMPTS = 5;
export const HANDOVER_MAX_ATTEMPTS = 5;
export const CONFIRMATION_MAX_RESENDS = 3;
export const HANDOVER_MAX_REGENERATIONS = 3;
export const CONFIRMATION_RESEND_COOLDOWN_MS = 60_000;
export const CONFIRMATION_TTL_MS = 24 * 60 * 60 * 1000;

export type CodeCheck =
	| { ok: true }
	| { ok: false; reason: "invalid" | "expired" | "locked" | "attempts" };

export function generateCode(length: number): string {
	return String(randomInt(0, 10 ** length)).padStart(length, "0");
}

export function hashConfirmationCode(
	secret: string,
	orderId: string,
	phone: string,
	code: string,
): string {
	return createHash("sha256")
		.update(`${secret}:order:${orderId}:${phone}:${code}`)
		.digest("hex");
}

export function hashHandoverCode(
	secret: string,
	orderId: string,
	code: string,
): string {
	return createHash("sha256")
		.update(`${secret}:handover:${orderId}:${code}`)
		.digest("hex");
}

/** `timingSafeEqual` throws on a length mismatch, so the length check comes first. */
export function codesMatch(
	expectedHash: string | null | undefined,
	candidateHash: string,
): boolean {
	if (!expectedHash || expectedHash.length !== candidateHash.length)
		return false;
	return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(candidateHash));
}

/**
 * Expiry and the attempt budget are reported **before** validity. Telling a
 * buyer "incorrect" about a code that was right but late sends them hunting
 * for a typo; and answering "incorrect" after the budget is spent would let
 * an attacker keep probing for free.
 */
export function checkConfirmation(
	state: {
		codeHash?: string | null;
		codeExpiresAt?: string | null;
		attempts?: number | null;
	},
	candidateHash: string,
	now: Date,
): CodeCheck {
	if (!state.codeHash) return { ok: false, reason: "invalid" };
	if ((state.attempts ?? 0) >= CONFIRMATION_MAX_ATTEMPTS) {
		return { ok: false, reason: "attempts" };
	}
	const expiresAt = state.codeExpiresAt
		? Date.parse(state.codeExpiresAt)
		: Number.NaN;
	if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) {
		return { ok: false, reason: "expired" };
	}
	return codesMatch(state.codeHash, candidateHash)
		? { ok: true }
		: { ok: false, reason: "invalid" };
}

export function checkHandover(
	state: {
		codeHash?: string | null;
		attempts?: number | null;
		lockedAt?: string | null;
	},
	candidateHash: string,
): CodeCheck {
	if (state.lockedAt) return { ok: false, reason: "locked" };
	if ((state.attempts ?? 0) >= HANDOVER_MAX_ATTEMPTS)
		return { ok: false, reason: "locked" };
	if (!state.codeHash) return { ok: false, reason: "invalid" };
	return codesMatch(state.codeHash, candidateHash)
		? { ok: true }
		: { ok: false, reason: "invalid" };
}

export function canResend(
	state: { sentAt?: string | null; resendCount?: number | null },
	now: Date,
): boolean {
	if ((state.resendCount ?? 0) >= CONFIRMATION_MAX_RESENDS) return false;
	const sentAt = state.sentAt ? Date.parse(state.sentAt) : Number.NaN;
	if (!Number.isFinite(sentAt)) return true;
	return now.getTime() - sentAt >= CONFIRMATION_RESEND_COOLDOWN_MS;
}

export function canRegenerate(state: {
	regenerateCount?: number | null;
}): boolean {
	return (state.regenerateCount ?? 0) < HANDOVER_MAX_REGENERATIONS;
}
