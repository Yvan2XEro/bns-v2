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
