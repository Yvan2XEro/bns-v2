import { inLocale, type Localized } from "../contracts/notificationLocale";

const webUrl = () => process.env.PUBLIC_WEB_URL ?? "https://buynsellem.com";

/** Where the link in the email leads: the web page that confirms the token. */
export function verificationUrl(token: string): string {
	return `${webUrl()}/auth/verify-email?token=${encodeURIComponent(token)}`;
}

const SUBJECT: Localized = {
	fr: "Confirmez votre adresse e-mail",
	en: "Confirm your email address",
};

const COPY: Record<"greeting" | "body" | "button" | "ignore", Localized> = {
	greeting: { fr: "Bonjour {name},", en: "Hello {name}," },
	body: {
		fr: "Bienvenue sur BuyNSellem. Confirmez votre adresse e-mail pour vous connecter.",
		en: "Welcome to BuyNSellem. Confirm your email address to sign in.",
	},
	button: { fr: "Confirmer mon adresse", en: "Confirm my address" },
	ignore: {
		fr: "Vous n'avez pas créé de compte ? Ignorez cet e-mail.",
		en: "Did not create an account? Ignore this email.",
	},
};

const escapeHtml = (text: string) =>
	text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

export interface VerificationRecipient {
	name?: string | null;
	language?: string | null;
}

export function verificationEmailSubject(user: VerificationRecipient): string {
	return inLocale(SUBJECT, user.language);
}

/** A plain, table-free email: it renders the same in every mail client. */
export function verificationEmailHtml(
	user: VerificationRecipient,
	token: string,
): string {
	const t = (key: keyof typeof COPY) => inLocale(COPY[key], user.language);
	const url = escapeHtml(verificationUrl(token));
	const name = escapeHtml(user.name?.trim() || "");
	return [
		`<p>${escapeHtml(t("greeting")).replace("{name}", name)}</p>`,
		`<p>${escapeHtml(t("body"))}</p>`,
		`<p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#1e40af;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(t("button"))}</a></p>`,
		`<p style="color:#64748b;font-size:13px">${url}</p>`,
		`<p style="color:#64748b;font-size:13px">${escapeHtml(t("ignore"))}</p>`,
	].join("");
}
