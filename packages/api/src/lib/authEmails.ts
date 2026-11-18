import { inLocale, type Localized } from "../contracts/notificationLocale";

/**
 * The emails Payload sends for authentication — email verification and
 * password reset. Payload links them to its admin panel by default; these
 * link to the website's own pages, which call the API with the token.
 */

/** Where people land: the website, never the API host. */
export function webAuthUrl(path: string, token: string): string {
	const base = (process.env.PUBLIC_WEB_URL ?? "https://buynsellem.com").replace(
		/\/+$/,
		"",
	);
	return `${base}${path}?token=${encodeURIComponent(token)}`;
}

/** The web page that confirms an email address. */
export const verificationUrl = (token: string) =>
	webAuthUrl("/auth/verify-email", token);

/** The web page that sets a new password. */
export const resetPasswordUrl = (token: string) =>
	webAuthUrl("/auth/reset-password", token);

export interface AuthEmailRecipient {
	name?: string | null;
	language?: string | null;
}

const escapeHtml = (text: string) =>
	text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

interface EmailCopy {
	subject: Localized;
	body: Localized;
	button: Localized;
	footnote: Localized;
}

const GREETING: Localized = { fr: "Bonjour {name},", en: "Hello {name}," };

const VERIFICATION: EmailCopy = {
	subject: {
		fr: "Confirmez votre adresse e-mail",
		en: "Confirm your email address",
	},
	body: {
		fr: "Bienvenue sur BuyNSellem. Confirmez votre adresse e-mail pour vous connecter.",
		en: "Welcome to BuyNSellem. Confirm your email address to sign in.",
	},
	button: { fr: "Confirmer mon adresse", en: "Confirm my address" },
	footnote: {
		fr: "Vous n'avez pas créé de compte ? Ignorez cet e-mail.",
		en: "Did not create an account? Ignore this email.",
	},
};

const RESET_PASSWORD: EmailCopy = {
	subject: {
		fr: "Réinitialisez votre mot de passe",
		en: "Reset your password",
	},
	body: {
		fr: "Vous avez demandé un nouveau mot de passe pour BuyNSellem. Ce lien est valable une heure.",
		en: "You asked for a new BuyNSellem password. This link works for one hour.",
	},
	button: {
		fr: "Choisir un nouveau mot de passe",
		en: "Choose a new password",
	},
	footnote: {
		fr: "Vous n'avez rien demandé ? Ignorez cet e-mail : votre mot de passe ne change pas.",
		en: "Did not ask for this? Ignore this email: your password stays the same.",
	},
};

/** A plain, table-free email: it renders the same in every mail client. */
function render(
	copy: EmailCopy,
	user: AuthEmailRecipient,
	url: string,
): string {
	const t = (text: Localized) => escapeHtml(inLocale(text, user.language));
	const href = escapeHtml(url);
	const name = escapeHtml(user.name?.trim() || "");
	return [
		`<p>${t(GREETING).replace("{name}", name)}</p>`,
		`<p>${t(copy.body)}</p>`,
		`<p><a href="${href}" style="display:inline-block;padding:12px 20px;background:#1e40af;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${t(copy.button)}</a></p>`,
		`<p style="color:#64748b;font-size:13px">${href}</p>`,
		`<p style="color:#64748b;font-size:13px">${t(copy.footnote)}</p>`,
	].join("");
}

export const verificationEmailSubject = (user: AuthEmailRecipient) =>
	inLocale(VERIFICATION.subject, user.language);

export const verificationEmailHtml = (
	user: AuthEmailRecipient,
	token: string,
) => render(VERIFICATION, user, verificationUrl(token));

export const resetPasswordEmailSubject = (user: AuthEmailRecipient) =>
	inLocale(RESET_PASSWORD.subject, user.language);

export const resetPasswordEmailHtml = (
	user: AuthEmailRecipient,
	token: string,
) => render(RESET_PASSWORD, user, resetPasswordUrl(token));
