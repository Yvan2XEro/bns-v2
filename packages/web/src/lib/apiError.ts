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
	moderationForbidden: "moderation.forbidden",
	moderationRankTooLow: "moderation.rankTooLow",
	moderationTargetNotFound: "moderation.targetNotFound",
	moderationReasonRequired: "moderation.reasonRequired",
	moderationReasonInvalid: "moderation.reasonInvalid",
	moderationDurationInvalid: "moderation.durationInvalid",
	moderationInvalidTransition: "moderation.invalidTransition",

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

	cartEmpty: "cart.empty",
	cartItemUnavailable: "cart.itemUnavailable",
	cartOutOfStock: "cart.outOfStock",
	cartQuantityInvalid: "cart.quantityInvalid",
	cartSingleShop: "cart.singleShop",
	cartSingleFulfilment: "cart.singleFulfilment",
	checkoutDisabled: "checkout.disabled",
	checkoutPhoneNotVerified: "checkout.phoneNotVerified",
	checkoutAddressInvalid: "checkout.addressInvalid",
	checkoutCityNotServed: "checkout.cityNotServed",
	checkoutMethodUnavailable: "checkout.methodUnavailable",
	checkoutQuoteChanged: "checkout.quoteChanged",
	checkoutTermsNotAccepted: "checkout.termsNotAccepted",
	checkoutSelfPurchase: "checkout.selfPurchase",

	orderNotFound: "order.notFound",
	orderInvalidTransition: "order.invalidTransition",
	orderShopUnavailable: "order.shopUnavailable",
	orderCodUnavailable: "order.codUnavailable",
	orderBuyerCapReached: "order.buyerCapReached",
	orderShopCapReached: "order.shopCapReached",
	orderAcceptDeadlinePassed: "order.acceptDeadlinePassed",
	orderReasonRequired: "order.reasonRequired",
	orderConfirmationCodeInvalid: "order.confirmationCodeInvalid",
	orderConfirmationCodeExpired: "order.confirmationCodeExpired",
	orderCodeResendLimit: "order.codeResendLimit",
	orderHandoverCodeInvalid: "order.handoverCodeInvalid",
	orderHandoverLocked: "order.handoverLocked",
	orderContestWindowClosed: "order.contestWindowClosed",
	orderWithdrawalWindowClosed: "order.withdrawalWindowClosed",
	orderWithdrawalAlreadyRequested: "order.withdrawalAlreadyRequested",

	commissionInvoiceNotFound: "commission.invoiceNotFound",
	commissionAlreadyPaid: "commission.alreadyPaid",
	commissionNotPayable: "commission.notPayable",

	accountOpenOrders: "account.openOrders",
	accountUnpaidCommission: "account.unpaidCommission",

	paymentProtectedDisabled: "payment.protectedDisabled",
	paymentMarketUnavailable: "payment.marketUnavailable",
	paymentShopNotEligible: "payment.shopNotEligible",
	paymentOrderNotPayable: "payment.orderNotPayable",
	paymentAttemptInProgress: "payment.attemptInProgress",
	paymentTooManyAttempts: "payment.tooManyAttempts",
	paymentChannelUnsupported: "payment.channelUnsupported",
	paymentAmountTooHigh: "payment.amountTooHigh",
	paymentSelfPurchase: "payment.selfPurchase",
	paymentDeclined: "payment.declined",
	paymentInsufficientFunds: "payment.insufficientFunds",
	paymentTimeout: "payment.timeout",
	paymentLimitExceeded: "payment.limitExceeded",
	paymentExpired: "payment.expired",

	payoutOwnerOnly: "payout.ownerOnly",
	payoutMethodUnavailable: "payout.methodUnavailable",
	payoutAccountInvalid: "payout.accountInvalid",
	payoutAccountNameMismatch: "payout.accountNameMismatch",
	payoutAccountChangeCooldown: "payout.accountChangeCooldown",
	payoutOnboardingIncomplete: "payout.onboardingIncomplete",
	payoutHoldActive: "payout.holdActive",

	refundAmountExceeds: "refund.amountExceeds",
	refundNotRefundable: "refund.notRefundable",
	refundWindowExpired: "refund.windowExpired",

	returnNotEligible: "return.notEligible",
	returnWindowClosed: "return.windowClosed",
	returnItemsInvalid: "return.itemsInvalid",
	returnAlreadyOpen: "return.alreadyOpen",
	returnInvalidTransition: "return.invalidTransition",
	returnDeductionEvidenceRequired: "return.deductionEvidenceRequired",
	returnDeductionNotAllowed: "return.deductionNotAllowed",
	returnRefundProofInvalid: "return.refundProofInvalid",

	disputeDisabled: "dispute.disabled",
	disputeNotParty: "dispute.notParty",
	disputeReasonNotAllowed: "dispute.reasonNotAllowed",
	disputeWindowClosed: "dispute.windowClosed",
	disputeAlreadyOpen: "dispute.alreadyOpen",
	disputeReturnCaseActive: "dispute.returnCaseActive",
	disputeEvidenceRequired: "dispute.evidenceRequired",
	disputeEvidenceLimit: "dispute.evidenceLimit",
	disputeInvalidTransition: "dispute.invalidTransition",
	disputeProposalInvalid: "dispute.proposalInvalid",
	disputeRefundExceedsOrder: "dispute.refundExceedsOrder",
	resaleTermsNotAccepted: "resale.termsNotAccepted",
	resaleDisabled: "resale.disabled",
	resaleNotEnabled: "resale.notEnabled",
	resaleSupplierNotEligible: "resale.supplierNotEligible",
	resaleResellerNotEligible: "resale.resellerNotEligible",
	resaleLinkInactive: "resale.linkInactive",
	resaleLinkRequired: "resale.linkRequired",
	resaleOwnProduct: "resale.ownProduct",
	resaleInvalidPricing: "resale.invalidPricing",
	resaleSupplierUndercut: "resale.supplierUndercut",
	resaleCodRequired: "resale.codRequired",
	resalePriceBelowMinimum: "resale.priceBelowMinimum",
	resalePriceAboveMaximum: "resale.priceAboveMaximum",
	resalePrepaidUnavailable: "resale.prepaidUnavailable",
	resaleFulfilledBySupplier: "resale.fulfilledBySupplier",
	resaleAlreadyReselling: "resale.alreadyReselling",
	resaleChargeOverdue: "resale.chargeOverdue",
	resaleChargeNotFound: "resale.chargeNotFound",
	resaleChargeNotPayable: "resale.chargeNotPayable",
	purchaseOrderNotFound: "purchaseOrder.notFound",
	purchaseOrderInvalidTransition: "purchaseOrder.invalidTransition",
	purchaseOrderAcceptExpired: "purchaseOrder.acceptExpired",
	purchaseOrderTrackingRequired: "purchaseOrder.trackingRequired",
	deliveryZoneInvalid: "delivery.zoneInvalid",
	deliveryZoneOverlap: "delivery.zoneOverlap",
	deliveryZoneLimitReached: "delivery.zoneLimitReached",
	deliveryCityNotLaunched: "delivery.cityNotLaunched",
	deliveryLocationInvalid: "delivery.locationInvalid",
	deliveryLocationLimitReached: "delivery.locationLimitReached",
	deliveryNoActiveOption: "delivery.noActiveOption",
	shipmentNotFound: "shipment.notFound",
	shipmentInvalidTransition: "shipment.invalidTransition",
	shipmentMaxAttemptsReached: "shipment.maxAttemptsReached",
	shipmentPhotoRequired: "shipment.photoRequired",
	shipmentRescheduleWindowClosed: "shipment.rescheduleWindowClosed",
	shipmentRescheduleDateInvalid: "shipment.rescheduleDateInvalid",
	shipmentRiderLinkInvalid: "shipment.riderLinkInvalid",
	shipmentNotAssigned: "shipment.notAssigned",
	shipmentRiderConsentMissing: "shipment.riderConsentMissing",
	courierUnavailable: "courier.unavailable",
	courierNotConfigured: "courier.notConfigured",
	courierCityNotServed: "courier.cityNotServed",
	courierProviderError: "courier.providerError",
	courierCancelRefused: "courier.cancelRefused",
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

	[ERROR_CODES.cartEmpty]: "Your cart is empty.",
	[ERROR_CODES.cartItemUnavailable]: "This item can no longer be ordered.",
	[ERROR_CODES.cartOutOfStock]: "Not enough stock for this quantity.",
	[ERROR_CODES.cartQuantityInvalid]: "Choose a quantity between 1 and 20.",
	[ERROR_CODES.cartSingleShop]: "Your cart holds items from another shop.",
	[ERROR_CODES.cartSingleFulfilment]:
		"Your cart can contain items fulfilled by one supplier at a time.",
	[ERROR_CODES.checkoutDisabled]: "Checkout is not available yet.",
	[ERROR_CODES.checkoutPhoneNotVerified]:
		"Verify your phone number to place an order.",
	[ERROR_CODES.checkoutAddressInvalid]: "Please check the delivery address.",
	[ERROR_CODES.checkoutCityNotServed]:
		"This shop does not deliver to this city yet.",
	[ERROR_CODES.checkoutMethodUnavailable]:
		"This delivery or payment method is not available.",
	[ERROR_CODES.checkoutQuoteChanged]:
		"Your order summary has changed. Please review it again.",
	[ERROR_CODES.checkoutTermsNotAccepted]:
		"Please accept the terms of sale to continue.",
	[ERROR_CODES.checkoutSelfPurchase]: "You cannot order from your own shop.",
	[ERROR_CODES.orderNotFound]: "This order does not exist.",
	[ERROR_CODES.orderInvalidTransition]:
		"This order is not in a state that allows that action.",
	[ERROR_CODES.orderShopUnavailable]: "This shop cannot take orders right now.",
	[ERROR_CODES.orderCodUnavailable]:
		"Cash on delivery is not available for this order.",
	[ERROR_CODES.orderBuyerCapReached]:
		"You have reached your limit of cash-on-delivery orders.",
	[ERROR_CODES.orderShopCapReached]: "This shop has reached its order limit.",
	[ERROR_CODES.orderAcceptDeadlinePassed]:
		"The 48-hour deadline to accept this order has passed.",
	[ERROR_CODES.orderReasonRequired]: "A reason is required.",
	[ERROR_CODES.orderConfirmationCodeInvalid]:
		"This confirmation code is incorrect.",
	[ERROR_CODES.orderConfirmationCodeExpired]:
		"This confirmation code has expired.",
	[ERROR_CODES.orderCodeResendLimit]: "This code can no longer be resent.",
	[ERROR_CODES.orderHandoverCodeInvalid]: "This handover code is incorrect.",
	[ERROR_CODES.orderHandoverLocked]:
		"Too many incorrect handover codes. Ask the buyer for a new code or to confirm in the app.",
	[ERROR_CODES.orderContestWindowClosed]:
		"The window to contest this delivery has closed.",
	[ERROR_CODES.orderWithdrawalWindowClosed]:
		"The 15-day return window has closed.",
	[ERROR_CODES.orderWithdrawalAlreadyRequested]:
		"A return is already in progress for this order.",
	[ERROR_CODES.commissionInvoiceNotFound]: "This invoice does not exist.",
	[ERROR_CODES.commissionAlreadyPaid]: "This invoice has already been paid.",
	[ERROR_CODES.commissionNotPayable]: "This invoice can no longer be paid.",
	[ERROR_CODES.accountOpenOrders]: "You still have orders in progress.",
	[ERROR_CODES.accountUnpaidCommission]:
		"Your shop has an unpaid commission invoice.",
	[ERROR_CODES.paymentProtectedDisabled]:
		"Protected payment is not available yet.",
	[ERROR_CODES.paymentMarketUnavailable]:
		"Protected payment is not available in this country yet.",
	[ERROR_CODES.paymentShopNotEligible]:
		"This shop cannot receive protected payments yet.",
	[ERROR_CODES.paymentOrderNotPayable]: "This order can no longer be paid.",
	[ERROR_CODES.paymentAttemptInProgress]:
		"A payment attempt is already in progress. Approve it on your phone or wait a moment.",
	[ERROR_CODES.paymentTooManyAttempts]:
		"You have reached the maximum number of payment attempts for this order.",
	[ERROR_CODES.paymentChannelUnsupported]:
		"This payment method is not available here. Please choose another one.",
	[ERROR_CODES.paymentAmountTooHigh]:
		"This order is above the maximum amount for protected payment.",
	[ERROR_CODES.paymentSelfPurchase]:
		"You cannot pay this shop from your own account or from a phone number linked to the shop.",
	[ERROR_CODES.paymentDeclined]:
		"The payment was declined. Please try again or use another number.",
	[ERROR_CODES.paymentInsufficientFunds]:
		"The balance on this account is too low. Top it up and try again, or use another number.",
	[ERROR_CODES.paymentTimeout]:
		"The payment was not approved in time. Please try again and approve it on your phone.",
	[ERROR_CODES.paymentLimitExceeded]:
		"This payment is above your account's transaction limit. Use another number or contact your operator.",
	[ERROR_CODES.paymentExpired]:
		"The time to pay has run out. If money was taken from your account, it will be refunded automatically.",
	[ERROR_CODES.payoutOwnerOnly]: "Only the shop owner can manage payouts.",
	[ERROR_CODES.payoutMethodUnavailable]:
		"This payout method is not available yet. Please choose another one.",
	[ERROR_CODES.payoutAccountInvalid]:
		"This account number is not valid for the chosen payout method.",
	[ERROR_CODES.payoutAccountNameMismatch]:
		"The account holder's name does not match your verified identity.",
	[ERROR_CODES.payoutAccountChangeCooldown]:
		"You changed your payout account recently. Please wait before changing it again.",
	[ERROR_CODES.payoutOnboardingIncomplete]:
		"Finish setting up your payment account to receive payouts.",
	[ERROR_CODES.payoutHoldActive]:
		"Payouts for this shop are paused while our team carries out a review. We will let you know when they resume.",
	[ERROR_CODES.refundAmountExceeds]:
		"This amount is more than what remains refundable on this order.",
	[ERROR_CODES.refundNotRefundable]:
		"This order has no online payment to refund.",
	[ERROR_CODES.refundWindowExpired]:
		"This payment is too old to be refunded automatically. The refund will be arranged directly with the seller.",

	[ERROR_CODES.returnNotEligible]: "This order is not eligible for a return.",
	[ERROR_CODES.returnWindowClosed]:
		"The return window for this order has closed.",
	[ERROR_CODES.returnItemsInvalid]:
		"Please check the items and quantities you want to return.",
	[ERROR_CODES.returnAlreadyOpen]: "A return is already open for this order.",
	[ERROR_CODES.returnInvalidTransition]:
		"This return is not in a state that allows that action.",
	[ERROR_CODES.returnDeductionEvidenceRequired]:
		"A deduction needs at least one photo of the item's condition before it can be applied.",
	[ERROR_CODES.returnDeductionNotAllowed]:
		"No deduction can be applied for this return reason.",
	[ERROR_CODES.returnRefundProofInvalid]:
		"Please check the refund proof: a transaction ID is required for mobile money, and at least one photo of the proof.",

	[ERROR_CODES.disputeDisabled]:
		"Disputes are not open yet. Contact us and we will follow up on your order.",
	[ERROR_CODES.disputeNotParty]:
		"You are not a party to this order, so you cannot open a dispute on it.",
	[ERROR_CODES.disputeReasonNotAllowed]:
		"This reason is not available to you for this order.",
	[ERROR_CODES.disputeWindowClosed]:
		"The window to open a dispute for this reason has closed.",
	[ERROR_CODES.disputeAlreadyOpen]: "A dispute is already open for this order.",
	[ERROR_CODES.disputeReturnCaseActive]:
		"These items are already part of an active return. Reference it instead of opening a new dispute.",
	[ERROR_CODES.disputeEvidenceRequired]:
		"This reason needs at least one photo or video before you can submit.",
	[ERROR_CODES.disputeEvidenceLimit]:
		"You have reached the evidence limit for this dispute.",
	[ERROR_CODES.disputeInvalidTransition]:
		"This dispute is not in a state that allows that action.",
	[ERROR_CODES.disputeProposalInvalid]:
		"This proposal cannot be sent. Check the amount and the number of rounds already used.",
	[ERROR_CODES.disputeRefundExceedsOrder]:
		"This refund amount is more than what remains refundable on this order.",
	[ERROR_CODES.resaleTermsNotAccepted]:
		"Accept the current resale terms for this shop before continuing.",
	[ERROR_CODES.resaleDisabled]: "Resale is not enabled yet.",
	[ERROR_CODES.resaleNotEnabled]: "This product is not enabled for resale.",
	[ERROR_CODES.resaleSupplierNotEligible]:
		"This shop does not meet the requirements to supply resale products.",
	[ERROR_CODES.resaleResellerNotEligible]:
		"This shop does not meet the requirements to resell products.",
	[ERROR_CODES.resaleOwnProduct]:
		"These shops cannot be linked because they share an owner or member.",
	[ERROR_CODES.resaleLinkInactive]:
		"This resale link is inactive. Ask the supplier to restore it before reselling.",
	[ERROR_CODES.resaleLinkRequired]:
		"Request and receive supplier approval before reselling this product.",
	[ERROR_CODES.resaleInvalidPricing]:
		"One or more reseller prices are outside the supplier's allowed range.",
	[ERROR_CODES.resaleSupplierUndercut]:
		"The reseller price cannot be below the supplier's own price.",
	[ERROR_CODES.resaleCodRequired]:
		"This resale product is not available with the selected payment method.",
	[ERROR_CODES.resalePriceBelowMinimum]:
		"The resale price is below the supplier's current minimum.",
	[ERROR_CODES.resalePriceAboveMaximum]:
		"The resale price is above the allowed maximum.",
	[ERROR_CODES.resalePrepaidUnavailable]:
		"Online payment is not available for resale orders yet.",
	[ERROR_CODES.resaleFulfilledBySupplier]:
		"The supplier handles shipping and delivery for this resale order.",
	[ERROR_CODES.resaleChargeOverdue]:
		"Pay or resolve the overdue resale charge before continuing.",
	[ERROR_CODES.resaleChargeNotFound]: "This resale charge could not be found.",
	[ERROR_CODES.resaleChargeNotPayable]:
		"This resale charge is no longer payable.",
	[ERROR_CODES.deliveryZoneInvalid]:
		"Check the delivery zone details and try again.",
	[ERROR_CODES.deliveryZoneOverlap]:
		"Another active zone of this shop already covers one of these districts.",
	[ERROR_CODES.deliveryZoneLimitReached]:
		"This shop has reached its delivery zone limit.",
	[ERROR_CODES.deliveryCityNotLaunched]:
		"Delivery has not launched in this city yet.",
	[ERROR_CODES.deliveryLocationInvalid]:
		"Check the pickup location and its coordinates.",
	[ERROR_CODES.deliveryLocationLimitReached]:
		"This shop has reached its pickup location limit.",
	[ERROR_CODES.deliveryNoActiveOption]:
		"No delivery or pickup option is currently available for this address.",
	[ERROR_CODES.shipmentNotFound]: "This shipment could not be found.",
	[ERROR_CODES.shipmentInvalidTransition]:
		"This shipment is not in a state that allows that action.",
	[ERROR_CODES.shipmentMaxAttemptsReached]:
		"The maximum number of delivery attempts has been reached.",
	[ERROR_CODES.shipmentPhotoRequired]:
		"Add the required delivery photo before continuing.",
	[ERROR_CODES.shipmentRescheduleWindowClosed]:
		"The window to choose a new delivery slot has closed. The parcel is being returned to the shop.",
	[ERROR_CODES.shipmentRescheduleDateInvalid]:
		"Choose one of the delivery dates offered for this shipment.",
	[ERROR_CODES.shipmentRiderLinkInvalid]:
		"This delivery link is no longer valid.",
	[ERROR_CODES.shipmentNotAssigned]:
		"This shipment is not assigned to your courier account.",
	[ERROR_CODES.shipmentRiderConsentMissing]:
		"The rider must consent before receiving a delivery assignment.",
	[ERROR_CODES.courierUnavailable]:
		"No courier is currently available for this delivery.",
	[ERROR_CODES.courierNotConfigured]:
		"Courier delivery is not configured yet. Choose another delivery option.",
	[ERROR_CODES.courierCityNotServed]:
		"This courier does not serve the selected city.",
	[ERROR_CODES.courierProviderError]:
		"The courier could not process this request. Please try again shortly.",
	[ERROR_CODES.courierCancelRefused]:
		"The courier refused the cancellation. The shipment remains active.",
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

export type NormalizedError = {
	code: string;
	message: string;
	/**
	 * The structured payload our own routes attach beside the code —
	 * `cart.singleShop` names the conflicting shop, `order.handoverLocked`
	 * carries the lock state and attempts left. Only the trusted envelope (1)
	 * ever provides it; a Payload-shaped error gets null, so nothing a hook
	 * or internal error fabricates can reach a screen as if it were ours.
	 */
	details: null | Record<string, unknown>;
};

function detailsOf(value: unknown): null | Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function normalizeApiError(
	status: number,
	body: unknown,
): NormalizedError {
	const b = (body ?? {}) as {
		code?: unknown;
		details?: unknown;
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
			details: detailsOf(b.details),
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
			return { code: dataCode, message: fallbackFor(dataCode), details: null };
		}

		const nested = first?.data?.errors;
		const nestedText =
			Array.isArray(nested) && typeof nested[0]?.message === "string"
				? nested[0].message
				: "";
		const outerText = typeof first?.message === "string" ? first.message : "";

		const code = codeForPayloadError(status, `${nestedText} ${outerText}`);
		return { code, message: fallbackFor(code), details: null };
	}

	// (3) Anything else, including Payload's bare { message } internals, whose
	// text is developer-facing and must not be shown.
	const code = codeForStatus(status);
	return { code, message: fallbackFor(code), details: null };
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
	details: null | Record<string, unknown>;

	constructor(
		message: string,
		status: number,
		code: string,
		details: null | Record<string, unknown> = null,
	) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

/** Builds an ApiError from a failed response body. */
export function apiErrorFrom(status: number, body: unknown): ApiError {
	const { code, message, details } = normalizeApiError(status, body);
	return new ApiError(message, status, code, details);
}
