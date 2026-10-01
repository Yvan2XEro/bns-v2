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
 * Codes are resolved under their own namespace rather than the existing flat
 * `errors.*` one, which already holds strings at `errors.generic`,
 * `errors.network` and friends — nesting under those would shadow them.
 */
const I18N_NAMESPACE = "apiErrors";

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
	accountSuspended: "moderation.accountSuspended",
	moderationForbidden: "moderation.forbidden",
	moderationRankTooLow: "moderation.rankTooLow",
	moderationTargetNotFound: "moderation.targetNotFound",
	moderationReasonRequired: "moderation.reasonRequired",
	moderationReasonInvalid: "moderation.reasonInvalid",
	moderationDurationInvalid: "moderation.durationInvalid",
	moderationInvalidTransition: "moderation.invalidTransition",

	paymentProviderUnavailable: "payment.providerUnavailable",
	boostNotOwner: "boost.notOwner",
	boostListingNotPublished: "boost.listingNotPublished",
	boostInvalidDuration: "boost.invalidDuration",

	reviewSelf: "review.self",
	reviewDuplicate: "review.duplicate",
	reviewNoInteraction: "review.noInteraction",

	verificationDisabled: "verification.disabled",
	verificationNotOwner: "verification.notOwner",
	verificationLevelNotEligible: "verification.levelNotEligible",
	verificationRequestOpen: "verification.requestOpen",
	verificationCooldown: "verification.cooldown",
	verificationInvalidTransition: "verification.invalidTransition",
	verificationConsentRequired: "verification.consentRequired",
	verificationTooManyAttempts: "verification.tooManyAttempts",
	verificationKycUnavailable: "verification.kycUnavailable",
	verificationDocumentLimit: "verification.documentLimit",
	verificationDocumentsMissing: "verification.documentsMissing",
	verificationFieldsInvalid: "verification.fieldsInvalid",
	verificationNotAssignee: "verification.notAssignee",
	verificationConflictOfInterest: "verification.conflictOfInterest",
	verificationChecklistIncomplete: "verification.checklistIncomplete",
	verificationHashUnavailable: "verification.hashUnavailable",

	shopForbidden: "shop.forbidden",
	teamLevelRequired: "team.levelRequired",
	teamLimitReached: "team.limitReached",
	teamAlreadyMember: "team.alreadyMember",
	teamInvitationPending: "team.invitationPending",
	teamInvitationInvalid: "team.invitationInvalid",
	teamInvitationMismatch: "team.invitationMismatch",
	teamPhoneVerificationRequired: "team.phoneVerificationRequired",
	teamCannotInviteSelf: "team.cannotInviteSelf",
	teamResendLimit: "team.resendLimit",
	teamOwnerCannotLeave: "team.ownerCannotLeave",
	teamCannotManageRole: "team.cannotManageRole",
	inboxNotAssignable: "inbox.notAssignable",
	messagesNotParticipant: "messages.notParticipant",
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
	[ERROR_CODES.shopDisabled]: "Shops are not available yet.",
	[ERROR_CODES.shopPhoneNotVerified]:
		"Verify your phone number to open a shop.",
	[ERROR_CODES.shopLimitReached]: "You already have a shop.",
	[ERROR_CODES.shopHandleInvalid]:
		"Use 3 to 30 lowercase letters, digits or single hyphens.",
	[ERROR_CODES.shopHandleReserved]: "This address is reserved.",
	[ERROR_CODES.shopHandleTaken]: "This address is already taken.",
	[ERROR_CODES.shopHandleCooldown]:
		"The shop address can only change once every 30 days.",
	[ERROR_CODES.shopNotMember]: "You are not a member of this shop.",
	[ERROR_CODES.shopInactive]: "This shop is not active.",
	[ERROR_CODES.shopNotFound]: "This shop does not exist or is unavailable.",
	[ERROR_CODES.stockNegative]: "Stock cannot go below zero.",
	[ERROR_CODES.stockInsufficient]:
		"Not enough stock available: some units are already reserved. Lower the quantity or release a reservation first.",
	[ERROR_CODES.accountSuspended]:
		"Your account is suspended. You cannot publish listings or send messages right now.",
	[ERROR_CODES.moderationForbidden]:
		"You do not have permission to moderate this content.",
	[ERROR_CODES.moderationRankTooLow]:
		"You cannot take this action against this account.",
	[ERROR_CODES.moderationTargetNotFound]:
		"The content you are trying to moderate no longer exists.",
	[ERROR_CODES.moderationReasonRequired]: "A reason is required.",
	[ERROR_CODES.moderationReasonInvalid]: "This reason is not recognised.",
	[ERROR_CODES.moderationDurationInvalid]:
		"This suspension length is not allowed for your role.",
	[ERROR_CODES.moderationInvalidTransition]:
		"This item is not in a state where that action applies.",
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

	[ERROR_CODES.verificationDisabled]: "Verification is not available yet.",
	[ERROR_CODES.verificationNotOwner]: "Only the shop owner can do this.",
	[ERROR_CODES.verificationLevelNotEligible]:
		"Verify your identity before requesting business verification.",
	[ERROR_CODES.verificationRequestOpen]:
		"A request for this level is already open.",
	[ERROR_CODES.verificationCooldown]:
		"You cannot open a new request yet. Please try again later.",
	[ERROR_CODES.verificationInvalidTransition]:
		"This request is not in a state where that action applies.",
	[ERROR_CODES.verificationConsentRequired]:
		"Please accept the current data-protection notice to continue.",
	[ERROR_CODES.verificationTooManyAttempts]:
		"Too many verification attempts. Please try again later.",
	[ERROR_CODES.verificationKycUnavailable]:
		"Identity verification is unavailable right now. Please try again shortly.",
	[ERROR_CODES.verificationDocumentLimit]:
		"You have reached the maximum number of documents for this request.",
	[ERROR_CODES.verificationDocumentsMissing]:
		"Some required documents are still missing.",
	[ERROR_CODES.verificationFieldsInvalid]:
		"Please check the highlighted business details.",
	[ERROR_CODES.verificationNotAssignee]:
		"Only the reviewer who claimed this request can decide it.",
	[ERROR_CODES.verificationConflictOfInterest]:
		"You cannot review a shop you are involved with.",
	[ERROR_CODES.verificationChecklistIncomplete]:
		"Every checklist item must be confirmed before approving.",
	[ERROR_CODES.verificationHashUnavailable]:
		"Identity verification is misconfigured on our side. Please contact support.",

	[ERROR_CODES.shopForbidden]: "Your role in this shop does not allow that.",
	[ERROR_CODES.teamLevelRequired]: "Verify your identity to add team members.",
	[ERROR_CODES.teamLimitReached]: "This shop has reached its team size limit.",
	[ERROR_CODES.teamAlreadyMember]:
		"This person is already a member of the shop.",
	[ERROR_CODES.teamInvitationPending]:
		"An invitation is already pending for this person.",
	[ERROR_CODES.teamInvitationInvalid]: "This invitation is no longer valid.",
	[ERROR_CODES.teamInvitationMismatch]:
		"This invitation was sent to a different phone number or email address.",
	[ERROR_CODES.teamPhoneVerificationRequired]:
		"Verify your phone number to accept this invitation.",
	[ERROR_CODES.teamCannotInviteSelf]: "You cannot invite yourself.",
	[ERROR_CODES.teamResendLimit]: "This invitation cannot be sent again yet.",
	[ERROR_CODES.teamOwnerCannotLeave]: "The owner cannot leave their own shop.",
	[ERROR_CODES.teamCannotManageRole]: "You cannot change this member's role.",
	[ERROR_CODES.inboxNotAssignable]:
		"This person cannot be assigned to shop conversations.",
	[ERROR_CODES.messagesNotParticipant]:
		"You are not part of this conversation.",
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

		// Hook errors (APIError with `{ code }`) keep their code; their message
		// is our own English fallback, so it is safe to show.
		if (typeof first?.data?.code === "string" && first.data.code) {
			return {
				code: first.data.code,
				message:
					typeof first.message === "string" && first.message
						? first.message
						: fallbackFor(first.data.code),
			};
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
		const key = `${I18N_NAMESPACE}.${code}`;
		const translated = t(key);
		if (translated && translated !== key) return translated;

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
	const key = `${I18N_NAMESPACE}.${code}`;
	const translated = t(key);
	return translated && translated !== key ? translated : fallbackFor(code);
}
