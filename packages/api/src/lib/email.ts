import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import { resendAdapter } from "@payloadcms/email-resend";
import type { EmailAdapter } from "payload";

export const EMAIL_PROVIDERS = ["resend", "smtp"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

/**
 * Which service sends Payload's own emails (email verification, password
 * reset): `EMAIL_PROVIDER=resend` with `RESEND_API_KEY`, or
 * `EMAIL_PROVIDER=smtp` with `SMTP_HOST` (any SMTP server, through
 * nodemailer). Left unset, the provider follows whichever key is present.
 * With neither, Payload writes each email to the log, which is what
 * development wants and what a misconfigured deploy shows.
 */
export function emailProvider(
	env: Record<string, string | undefined> = process.env,
): EmailProvider | null {
	const chosen = env.EMAIL_PROVIDER?.trim().toLowerCase();
	if (chosen === "resend" || chosen === "smtp") return chosen;
	if (env.RESEND_API_KEY) return "resend";
	if (env.SMTP_HOST) return "smtp";
	return null;
}

export function emailAdapter(
	env: Record<string, string | undefined> = process.env,
): EmailAdapter | Promise<EmailAdapter> | undefined {
	const from = {
		defaultFromAddress: env.EMAIL_FROM_ADDRESS ?? "no-reply@buynsellem.com",
		defaultFromName: env.EMAIL_FROM_NAME ?? "BuyNSellem",
	};
	switch (emailProvider(env)) {
		case "resend":
			if (!env.RESEND_API_KEY)
				throw new Error("EMAIL_PROVIDER=resend needs RESEND_API_KEY");
			return resendAdapter({ ...from, apiKey: env.RESEND_API_KEY });
		case "smtp": {
			if (!env.SMTP_HOST)
				throw new Error("EMAIL_PROVIDER=smtp needs SMTP_HOST");
			const port = Number(env.SMTP_PORT ?? 587);
			return nodemailerAdapter({
				...from,
				transportOptions: {
					host: env.SMTP_HOST,
					port,
					// 465 is TLS from the first byte; 587 and 25 upgrade with STARTTLS.
					secure: port === 465,
					...(env.SMTP_USER
						? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } }
						: {}),
				},
			});
		}
		default:
			return undefined;
	}
}
