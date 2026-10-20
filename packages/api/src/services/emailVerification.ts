import { randomBytes } from "node:crypto";
import type { Payload } from "payload";
import {
	verificationEmailHtml,
	verificationEmailSubject,
} from "../lib/authEmails";

/** Between two verification emails to the same account. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

export type ResendOutcome = "sent" | "cooldown" | "nothing";

/**
 * Sends the verification email again — Payload sends it only once, when the
 * account is created, and has no resend of its own.
 *
 * A new token replaces the old one, so only the latest link works. The
 * outcome stays on the server: the route answers the same whatever happened,
 * so the endpoint cannot tell anyone which addresses have an account.
 */
export async function resendVerificationEmail(
	payload: Payload,
	rawEmail: unknown,
	now: Date = new Date(),
): Promise<ResendOutcome> {
	const email =
		typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
	if (!email || email.length > 254) return "nothing";

	const found = await payload.find({
		collection: "users",
		where: { email: { equals: email } },
		depth: 0,
		limit: 1,
		overrideAccess: true,
		showHiddenFields: true,
	});
	const user = found.docs[0];
	// Already verified (or created before verification existed): nothing to send.
	if (!user || user._verified !== false) return "nothing";

	const lastSent = user.emailVerificationSentAt
		? new Date(user.emailVerificationSentAt).getTime()
		: 0;
	if (now.getTime() - lastSent < RESEND_COOLDOWN_MS) return "cooldown";

	// The same shape Payload gives the token it creates on sign-up.
	const token = randomBytes(20).toString("hex");
	await payload.db.updateOne({
		collection: "users",
		id: user.id,
		data: {
			_verificationToken: token,
			emailVerificationSentAt: now.toISOString(),
		},
		returning: false,
	});
	await payload.sendEmail({
		to: user.email,
		subject: verificationEmailSubject(user),
		html: verificationEmailHtml(user, token),
	});
	return "sent";
}
