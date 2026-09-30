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

	// Moderation
	accountSuspended: "moderation.accountSuspended",
	moderationForbidden: "moderation.forbidden",
	moderationRankTooLow: "moderation.rankTooLow",
	moderationTargetNotFound: "moderation.targetNotFound",
	moderationReasonRequired: "moderation.reasonRequired",
	moderationReasonInvalid: "moderation.reasonInvalid",
	moderationDurationInvalid: "moderation.durationInvalid",
	moderationInvalidTransition: "moderation.invalidTransition",

	// Payments and boosts
	paymentProviderUnavailable: "payment.providerUnavailable",
	// Logged when a provider reports another amount or currency; never sent to a client.
	paymentAmountMismatch: "payment.amountMismatch",
	boostNotOwner: "boost.notOwner",
	boostListingNotPublished: "boost.listingNotPublished",
	boostInvalidDuration: "boost.invalidDuration",

	// Reviews
	reviewSelf: "review.self",
	reviewDuplicate: "review.duplicate",
	reviewNoInteraction: "review.noInteraction",

	// Seller contact
	contactPhoneUnavailable: "contact.phoneUnavailable",

	// Shops and stock
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

	// Verification (P2)
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
	[ERROR_CODES.paymentAmountMismatch]: "The payment could not be confirmed.",
	[ERROR_CODES.boostNotOwner]: "You can only boost your own listings.",
	[ERROR_CODES.boostListingNotPublished]:
		"Only published listings can be boosted.",
	[ERROR_CODES.boostInvalidDuration]: "This boost duration is not available.",
	[ERROR_CODES.reviewSelf]: "You cannot review yourself.",
	[ERROR_CODES.reviewDuplicate]: "You have already reviewed this user.",
	[ERROR_CODES.reviewNoInteraction]:
		"You can review a user only after contacting them.",
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
		"The shop address can change once every 30 days.",
	[ERROR_CODES.shopNotMember]: "You do not manage this shop.",
	[ERROR_CODES.shopInactive]: "This shop is not active.",
	[ERROR_CODES.shopNotFound]: "This shop does not exist.",
	[ERROR_CODES.stockNegative]: "Stock cannot go below zero.",
	[ERROR_CODES.stockInsufficient]:
		"Not enough stock available: some units are already reserved.",
	[ERROR_CODES.stockCountStale]:
		"The stock changed while you were counting. Please count again.",

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
