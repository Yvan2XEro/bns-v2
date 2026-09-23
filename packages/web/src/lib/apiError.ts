/**
 * Turns any error response into a translation key plus a safe fallback.
 *
 * Three kinds of body reach us:
 *
 *  1. our own routes      { code, message }        — trusted, used as-is
 *  2. Payload collections { errors: [{ message }] } — English, developer-ish
 *  3. Payload internals   { message }               — "Route not found …"
 *
 * Only (1) is ever shown verbatim. The rule is deliberate: a `message` without
 * a `code` is developer-facing text, and surfacing it is how "Route not found
 * \"/api/usres\"" ends up in a user's alert. For (2) and (3) we derive a code
 * from the status and, where Payload's wording is stable enough to rely on,
 * from the error text.
 */

/**
 * next-intl namespace holding the translated copy. Distinct from the existing
 * `Error` namespace, which belongs to the page-level error boundary.
 */
const I18N_NAMESPACE = "ApiErrors";

export const ERROR_CODES = {
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

	emailTaken: "auth.emailTaken",
	invalidCredentials: "auth.invalidCredentials",
	accountLocked: "auth.accountLocked",
	emailNotVerified: "auth.emailNotVerified",
	invalidEmail: "auth.invalidEmail",
	oauthFailed: "auth.oauthFailed",
	oauthCancelled: "auth.oauthCancelled",
	oauthNotConfigured: "auth.oauthNotConfigured",

	phoneInvalid: "phone.invalid",
	phoneCodeInvalid: "phone.codeInvalid",
	phoneCodeExpired: "phone.codeExpired",
	phoneTooManyAttempts: "phone.tooManyAttempts",
	phoneCooldown: "phone.cooldown",
	phoneNotConfigured: "phone.notConfigured",

	messageBlocked: "messages.blocked",
	messageFailed: "messages.failed",

	listingNotFound: "listing.notFound",
	categoryNotFound: "listing.categoryNotFound",
	uploadTooLarge: "upload.tooLarge",
	uploadInvalidType: "upload.invalidType",

	contactIncomplete: "contact.incomplete",
	contactPhoneUnavailable: "contact.phoneUnavailable",

	paymentProviderUnavailable: "payment.providerUnavailable",
	boostNotOwner: "boost.notOwner",
	boostListingNotPublished: "boost.listingNotPublished",
	boostInvalidDuration: "boost.invalidDuration",

	reviewSelf: "review.self",
	reviewDuplicate: "review.duplicate",
	reviewNoInteraction: "review.noInteraction",

	accountSuspended: "moderation.accountSuspended",

	shopDisabled: "shop.disabled",
	shopPhoneNotVerified: "shop.phoneNotVerified",
	shopLimitReached: "shop.limitReached",
	shopHandleInvalid: "shop.handleInvalid",
	shopHandleReserved: "shop.handleReserved",
	shopHandleTaken: "shop.handleTaken",
	shopHandleCooldown: "shop.handleCooldown",
	shopNotMember: "shop.notMember",
	shopInactive: "shop.inactive",
	shopNotFound: "shop.notFound",
	stockNegative: "stock.negative",
	stockInsufficient: "stock.insufficient",
	stockCountStale: "stock.countStale",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Last-resort English text, mirroring the API's own fallbacks. */
const FALLBACKS: Record<string, string> = {
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
	[ERROR_CODES.contactPhoneUnavailable]:
		"This seller has not shared a phone number.",
	[ERROR_CODES.paymentProviderUnavailable]:
		"Payment is unavailable right now. Please try again later.",
	[ERROR_CODES.boostNotOwner]: "You can only boost your own listings.",
	[ERROR_CODES.boostListingNotPublished]:
		"Only published listings can be boosted.",
	[ERROR_CODES.boostInvalidDuration]: "This boost duration is not available.",
	[ERROR_CODES.reviewSelf]: "You cannot review yourself.",
	[ERROR_CODES.reviewDuplicate]: "You have already reviewed this user.",
	[ERROR_CODES.reviewNoInteraction]:
		"You can review a user only after contacting them.",
	[ERROR_CODES.accountSuspended]:
		"Your account is suspended. You cannot publish listings or send messages right now.",
	[ERROR_CODES.shopDisabled]: "Shops are not available yet.",
	[ERROR_CODES.shopPhoneNotVerified]:
		"Verify your phone number to open a shop.",
	[ERROR_CODES.shopLimitReached]: "You already have a shop.",
	[ERROR_CODES.shopHandleInvalid]:
		"This address is not valid. Use 3 to 30 lowercase letters, digits or hyphens.",
	[ERROR_CODES.shopHandleReserved]: "This address is reserved.",
	[ERROR_CODES.shopHandleTaken]: "This address is already taken.",
	[ERROR_CODES.shopHandleCooldown]:
		"The shop address can change only once every 30 days.",
	[ERROR_CODES.shopNotMember]: "You are not a member of this shop.",
	[ERROR_CODES.shopInactive]: "This shop is not active.",
	[ERROR_CODES.shopNotFound]: "This shop does not exist.",
	[ERROR_CODES.stockNegative]: "Stock cannot go below zero.",
	[ERROR_CODES.stockInsufficient]:
		"Not enough stock available: some units are already reserved. Lower the quantity or release a reservation first.",
	[ERROR_CODES.stockCountStale]:
		"The stock changed while you were counting. Reload the page and count again.",
};

export function fallbackFor(code: string): string {
	return FALLBACKS[code] ?? FALLBACKS[ERROR_CODES.unknown];
}

function codeForStatus(status: number): ErrorCode {
	if (status === 401) return ERROR_CODES.unauthorized;
	if (status === 403) return ERROR_CODES.forbidden;
	if (status === 404) return ERROR_CODES.notFound;
	if (status === 408) return ERROR_CODES.timeout;
	if (status === 409) return ERROR_CODES.validation;
	if (status === 413) return ERROR_CODES.uploadTooLarge;
	if (status === 429) return ERROR_CODES.rateLimited;
	if (status >= 500) return ERROR_CODES.server;
	if (status >= 400) return ERROR_CODES.badRequest;
	return ERROR_CODES.unknown;
}

/**
 * Payload's own errors. Its English wording is stable across a major version,
 * so matching on it is acceptable here — but the status always provides a
 * usable answer if the text ever changes.
 */
function codeForPayloadError(status: number, text: string): ErrorCode {
	const t = text.toLowerCase();

	// Both the pre-flight check and the Mongo 11000 race land here, with
	// different wording for the same user-visible situation.
	if (t.includes("already registered") || t.includes("must be unique")) {
		return ERROR_CODES.emailTaken;
	}
	// Raised by the blocked-users hook on messages; Payload wraps APIError
	// messages into the same errors[] array, losing any structured code.
	if (t.includes("exchange messages")) return ERROR_CODES.messageBlocked;
	if (t.includes("locked")) return ERROR_CODES.accountLocked;
	if (t.includes("verify your email")) return ERROR_CODES.emailNotVerified;
	if (status === 401) return ERROR_CODES.invalidCredentials;
	if (t.includes("email") && status === 400) return ERROR_CODES.invalidEmail;

	return codeForStatus(status);
}

export type NormalizedError = { code: string; message: string };

export function normalizeApiError(
	status: number,
	body: unknown,
): NormalizedError {
	const b = (body ?? {}) as {
		code?: unknown;
		message?: unknown;
		errors?: unknown;
	};

	// (1) Our own contract — the only case where the server's wording is shown.
	if (typeof b.code === "string" && b.code) {
		return {
			code: b.code,
			message:
				typeof b.message === "string" && b.message
					? b.message
					: fallbackFor(b.code),
		};
	}

	// (2) Payload collection errors. A ValidationError nests the useful text one
	// level down — the outer message is only "The following field is invalid:
	// email", while data.errors[0] carries "…is already registered". Both levels
	// are searched, innermost first.
	if (Array.isArray(b.errors) && b.errors.length > 0) {
		const first = b.errors[0] as {
			data?: { code?: unknown; errors?: Array<{ message?: unknown }> };
			message?: unknown;
		};

		// Our collection hooks throw APIError with `data.code`; Payload passes
		// `data` through untouched, so the code survives the REST layer.
		const dataCode = first?.data?.code;
		if (typeof dataCode === "string" && dataCode in FALLBACKS) {
			return { code: dataCode, message: fallbackFor(dataCode) };
		}

		const nested = first?.data?.errors;
		const nestedText =
			Array.isArray(nested) && typeof nested[0]?.message === "string"
				? nested[0].message
				: "";
		const outerText = typeof first?.message === "string" ? first.message : "";

		const code = codeForPayloadError(status, `${nestedText} ${outerText}`);
		return { code, message: fallbackFor(code) };
	}

	// (3) Anything else, including Payload's bare { message } internals, whose
	// text is developer-facing and must not be shown.
	const code = codeForStatus(status);
	return { code, message: fallbackFor(code) };
}

type TFunction = (key: string) => string;

/**
 * The single entry point screens use to turn a thrown value into display text.
 *
 * i18next returns the key itself when a translation is missing, so a bare
 * `t(code)` would render "auth.emailTaken". Comparing the result against
 * the key catches that and falls through to the English fallback.
 */
export function resolveErrorMessage(
	error: unknown,
	t: TFunction,
	/** Screen-specific wording, used when the failure carries no known code. */
	fallback?: string,
): string {
	const code =
		error && typeof error === "object" && "code" in error
			? String((error as { code: unknown }).code)
			: null;

	if (code && code in FALLBACKS) {
		const translated = safeTranslate(code, t);
		if (translated) return translated;

		// No translation for this code: prefer the server's fallback sentence
		// over the key path.
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string" && message) return message;
		return fallbackFor(code);
	}

	// Not one of ours — a bug in our own code, a thrown string, anything. Never
	// show its text: it is not written for users.
	return fallback ?? translateOrFallback(ERROR_CODES.unknown, t);
}

function translateOrFallback(code: ErrorCode, t: TFunction): string {
	return safeTranslate(code, t) ?? fallbackFor(code);
}

/**
 * next-intl may throw on a missing key rather than returning it, depending on
 * the configured error handler. Both behaviours mean "no translation".
 */
function safeTranslate(code: string, t: TFunction): null | string {
	const key = `${I18N_NAMESPACE}.${code}`;
	try {
		const translated = t(key);
		if (!translated || translated === key) return null;
		return translated;
	} catch {
		return null;
	}
}

/** Error carrying a normalized code, thrown by the web fetch helpers. */
export class ApiError extends Error {
	status: number;
	code: string;

	constructor(message: string, status: number, code: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
	}
}

/** Builds an ApiError from a failed response body. */
export function apiErrorFrom(status: number, body: unknown): ApiError {
	const { code, message } = normalizeApiError(status, body);
	return new ApiError(message, status, code);
}
