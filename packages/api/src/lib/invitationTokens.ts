import { randomBytes } from "node:crypto";
import { sha256 } from "./hash";

export const INVITATION_TOKEN_BYTES = 32;
export const INVITATION_TTL_DAYS = 7;
export const MAX_INVITATION_SENDS = 3;
export const INVITATION_RESEND_COOLDOWN_MS = 60 * 60 * 1000;

const DAY_MS = 86_400_000;

/**
 * The raw token exists only in the link that is sent. Nothing stores it: a
 * database dump therefore hands an attacker no usable invitation link, which
 * is the whole reason the column is a hash.
 *
 * Unpeppered, unlike `peppered()` in lib/hash.ts: 32 random bytes are not
 * brute-forceable, so a key would add a failure mode (a rotated pepper
 * invalidating every live invitation) for no gain.
 */
export function createInvitationToken(): { token: string; tokenHash: string } {
	const token = randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
	return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
	return sha256(token);
}

export function invitationExpiresAt(from: Date): string {
	return new Date(from.getTime() + INVITATION_TTL_DAYS * DAY_MS).toISOString();
}

/**
 * Expiry is a comparison at read time, not a status a job writes: a pending
 * invitation past its date grants nothing even if nothing swept the table. A
 * pending row with no `expiresAt` at all is treated as unusable rather than
 * eternal — corrupt data must not become a permanent invitation.
 */
export function isInvitationUsable(
	invitation: { status: string; expiresAt?: string | null },
	now: Date = new Date(),
): boolean {
	if (invitation.status !== "pending") return false;
	if (!invitation.expiresAt) return false;
	const at = Date.parse(invitation.expiresAt);
	return Number.isFinite(at) && at > now.getTime();
}
