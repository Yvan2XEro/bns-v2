// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	ERROR_CODES,
	errorResponse,
	fallbackMessage,
} from "../../src/lib/errors";

const P0_CODES = {
	paymentProviderUnavailable: "payment.providerUnavailable",
	paymentAmountMismatch: "payment.amountMismatch",
	boostNotOwner: "boost.notOwner",
	boostListingNotPublished: "boost.listingNotPublished",
	boostInvalidDuration: "boost.invalidDuration",
	reviewSelf: "review.self",
	reviewDuplicate: "review.duplicate",
	reviewNoInteraction: "review.noInteraction",
	contactPhoneUnavailable: "contact.phoneUnavailable",
} as const;

describe("P0 error codes", () => {
	it.each(Object.entries(P0_CODES))("defines %s as %s", (key, code) => {
		expect(ERROR_CODES[key as keyof typeof ERROR_CODES]).toBe(code);
	});

	it.each(Object.values(P0_CODES))("gives %s its own fallback", (code) => {
		expect(fallbackMessage(code)).not.toBe(
			fallbackMessage(ERROR_CODES.unknown),
		);
	});

	it("builds the shared response shape", async () => {
		const response = errorResponse(ERROR_CODES.boostNotOwner, 403);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			code: "boost.notOwner",
			message: "You can only boost your own listings.",
		});
	});
});

const P4_CODES = {
	cartEmpty: "cart.empty",
	cartItemUnavailable: "cart.itemUnavailable",
	cartOutOfStock: "cart.outOfStock",
	cartQuantityInvalid: "cart.quantityInvalid",
	cartSingleShop: "cart.singleShop",
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
	accountOpenOrders: "account.openOrders",
	accountUnpaidCommission: "account.unpaidCommission",
} as const;

describe("P4 error codes", () => {
	it.each(Object.entries(P4_CODES))("defines %s as %s", (key, code) => {
		expect(ERROR_CODES[key as keyof typeof ERROR_CODES]).toBe(code);
	});

	it.each(Object.values(P4_CODES))("gives %s its own fallback", (code) => {
		expect(fallbackMessage(code)).not.toBe(
			fallbackMessage(ERROR_CODES.unknown),
		);
	});

	it("builds the shared response shape", async () => {
		const response = errorResponse(ERROR_CODES.orderCodUnavailable, 409);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			code: "order.codUnavailable",
			message: "Cash on delivery is not available for this order.",
		});
	});
});

const P5_CODES = {
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
} as const;

describe("P5 error codes", () => {
	it("declares all twenty-four", () => {
		expect(Object.keys(P5_CODES)).toHaveLength(24);
	});

	it.each(Object.entries(P5_CODES))("defines %s as %s", (key, code) => {
		expect(ERROR_CODES[key as keyof typeof ERROR_CODES]).toBe(code);
	});

	it.each(Object.values(P5_CODES))("gives %s its own fallback", (code) => {
		expect(fallbackMessage(code)).not.toBe(
			fallbackMessage(ERROR_CODES.unknown),
		);
	});

	it("never gives two P5 codes the same fallback", () => {
		const messages = Object.values(P5_CODES).map(fallbackMessage);
		expect(new Set(messages).size).toBe(24);
	});

	it("builds the shared response shape", async () => {
		const response = errorResponse(ERROR_CODES.paymentAttemptInProgress, 409);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			code: "payment.attemptInProgress",
			message:
				"A payment attempt is already in progress. Approve it on your phone or wait a moment.",
		});
	});
});
