/**
 * User-facing error contract shared by the API, the web app and the mobile app.
 *
 * Every error response carries two fields:
 *
 *   code     a stable identifier ("auth.emailTaken") that each client resolves
 *            in its own translation catalogue, so the wording lives with the
 *            rest of the UI copy
 *   message  a plain-language fallback, used when the client has no
 *            translation for the code
 *
 * The fallback is deliberate redundancy. Both i18next and next-intl render the
 * raw key path when a lookup misses, so a code we forget to translate would put
 * "apiErrors.auth.emailTaken" in front of a user — worse than the status text
 * it replaced. The fallback makes a missing translation degrade to an
 * understandable sentence instead.
 *
 * Fallbacks are English: they are a safety net, not the shipping copy. The
 * translated strings in the clients' locale files are what users normally see.
 *
 * The code is deliberately NOT a full key path: mobile resolves it under
 * `apiErrors.`, web under `ApiErrors.`, each following its own convention.
 */

export const ERROR_CODES = {
	// Generic — mapped from a bare status when nothing more specific is known.
	unknown: "generic.unknown",
	network: "generic.network",
	timeout: "generic.timeout",
	server: "generic.server",
	badRequest: "generic.badRequest",
	notFound: "generic.notFound",
	forbidden: "generic.forbidden",
	unauthorized: "generic.unauthorized",
	validation: "generic.validation",
	rateLimited: "generic.rateLimited",

	// Account and sign-in
	emailTaken: "auth.emailTaken",
	invalidCredentials: "auth.invalidCredentials",
	accountLocked: "auth.accountLocked",
	emailNotVerified: "auth.emailNotVerified",
	invalidEmail: "auth.invalidEmail",
	oauthFailed: "auth.oauthFailed",
	oauthCancelled: "auth.oauthCancelled",
	oauthNotConfigured: "auth.oauthNotConfigured",

	// Phone verification
	phoneInvalid: "phone.invalid",
	phoneCodeInvalid: "phone.codeInvalid",
	phoneCodeExpired: "phone.codeExpired",
	phoneTooManyAttempts: "phone.tooManyAttempts",
	phoneCooldown: "phone.cooldown",
	phoneNotConfigured: "phone.notConfigured",

	// Messaging
	messageBlocked: "messages.blocked",
	messageFailed: "messages.failed",

	// Listings and uploads
	listingNotFound: "listing.notFound",
	categoryNotFound: "listing.categoryNotFound",
	uploadTooLarge: "upload.tooLarge",
	uploadInvalidType: "upload.invalidType",

	// Contact form
	contactIncomplete: "contact.incomplete",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const FALLBACKS: Record<ErrorCode, string> = {
	[ERROR_CODES.unknown]: "Something went wrong. Please try again.",
	[ERROR_CODES.network]:
		"Could not reach the server. Please check your connection.",
	[ERROR_CODES.timeout]: "The request took too long. Please try again.",
	[ERROR_CODES.server]:
		"Something went wrong on our side. Please try again shortly.",
	[ERROR_CODES.badRequest]: "Some of the information sent was not valid.",
	[ERROR_CODES.notFound]: "This content is no longer available.",
	[ERROR_CODES.forbidden]: "You do not have permission to do this.",
	[ERROR_CODES.unauthorized]: "Please sign in to continue.",
	[ERROR_CODES.validation]: "Please check the highlighted fields.",
	[ERROR_CODES.rateLimited]: "Too many attempts. Please wait a moment.",

	[ERROR_CODES.emailTaken]: "An account already exists with this email.",
	[ERROR_CODES.invalidCredentials]: "Incorrect email or password.",
	[ERROR_CODES.accountLocked]:
		"This account is temporarily locked after too many failed attempts.",
	[ERROR_CODES.emailNotVerified]:
		"Please confirm your email address before signing in.",
	[ERROR_CODES.invalidEmail]: "This email address is not valid.",
	[ERROR_CODES.oauthFailed]: "Sign-in failed. Please try again.",
	[ERROR_CODES.oauthCancelled]: "Sign-in was cancelled.",
	[ERROR_CODES.oauthNotConfigured]:
		"This sign-in method is unavailable right now.",

	[ERROR_CODES.phoneInvalid]: "This phone number is not valid.",
	[ERROR_CODES.phoneCodeInvalid]: "This code is incorrect.",
	[ERROR_CODES.phoneCodeExpired]:
		"This code has expired. Please request a new one.",
	[ERROR_CODES.phoneTooManyAttempts]:
		"Too many incorrect codes. Please request a new one.",
	[ERROR_CODES.phoneCooldown]:
		"Please wait a moment before requesting another code.",
	[ERROR_CODES.phoneNotConfigured]:
		"Phone verification is unavailable right now.",

	[ERROR_CODES.messageBlocked]:
		"You can no longer exchange messages with this user.",
	[ERROR_CODES.messageFailed]: "The message could not be sent.",

	[ERROR_CODES.listingNotFound]: "This listing is no longer available.",
	[ERROR_CODES.categoryNotFound]: "This category is no longer available.",
	[ERROR_CODES.uploadTooLarge]: "This file is too large.",
	[ERROR_CODES.uploadInvalidType]: "This file type is not supported.",

	[ERROR_CODES.contactIncomplete]: "Please fill in every field.",
};

export function fallbackMessage(code: ErrorCode): string {
	return FALLBACKS[code] ?? FALLBACKS[ERROR_CODES.unknown];
}

/**
 * Builds an error response in the shared shape.
 *
 * The message is never taken from an exception: internal text (a Mongo error,
 * a stack, an env var name) must not reach a client. Log the original instead.
 */
export function errorResponse(code: ErrorCode, status: number): Response {
	return Response.json({ code, message: fallbackMessage(code) }, { status });
}
