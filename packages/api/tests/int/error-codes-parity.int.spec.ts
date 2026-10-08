// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ERROR_CODES as mobileCodes } from "../../../mobile/src/lib/apiError";
import { ERROR_CODES as webCodes } from "../../../web/src/lib/apiError";
import { ERROR_CODES, fallbackMessage } from "../../src/lib/errors";

/**
 * Modelled on `shop-permissions-parity.int.spec.ts`: the clients hand-mirror
 * the code list rather than importing `lib/errors.ts` (which would drag
 * Payload's type surface into their type-checks), so this file imports both
 * mirrors into the API's own type-check and compares them against the single
 * source of truth. Before it existed, 33 new codes could be added here and
 * every suite in the repository stayed green while both clients fell back to
 * English developer text.
 */

/** Logged, never sent to a client — P0's rule, so no client translates it. */
const INTERNAL_ONLY = ["payment.amountMismatch"] as const;

const clientFacing = Object.values(ERROR_CODES).filter(
	(code) => !INTERNAL_ONLY.includes(code as (typeof INTERNAL_ONLY)[number]),
);

describe("the error contract is the same in all three packages", () => {
	it("web mirrors every client-facing code", () => {
		expect([...new Set(Object.values(webCodes))].sort()).toEqual(
			[...clientFacing].sort(),
		);
	});

	it("mobile mirrors every client-facing code", () => {
		expect([...new Set(Object.values(mobileCodes))].sort()).toEqual(
			[...clientFacing].sort(),
		);
	});

	it("gives each P4 code a fallback of its own", () => {
		for (const code of P4_CODES) {
			expect(fallbackMessage(code)).not.toBe(
				fallbackMessage(ERROR_CODES.unknown),
			);
		}
	});

	it("gives each P5 code a fallback of its own", () => {
		for (const code of P5_CODES) {
			expect(fallbackMessage(code)).not.toBe(
				fallbackMessage(ERROR_CODES.unknown),
			);
		}
	});

	it("gives each P6 code a fallback of its own", () => {
		for (const code of P6_CODES) {
			expect(fallbackMessage(code)).not.toBe(
				fallbackMessage(ERROR_CODES.unknown),
			);
		}
	});

	it("gives each P7 code a fallback of its own", () => {
		for (const code of P7_CODES) {
			expect(fallbackMessage(code)).not.toBe(
				fallbackMessage(ERROR_CODES.unknown),
			);
		}
	});
});

/** The spec's list, transcribed. Not derived from ERROR_CODES. */
const P4_CODES = [
	"cart.empty",
	"cart.itemUnavailable",
	"cart.outOfStock",
	"cart.quantityInvalid",
	"cart.singleShop",
	"checkout.disabled",
	"checkout.phoneNotVerified",
	"checkout.addressInvalid",
	"checkout.cityNotServed",
	"checkout.methodUnavailable",
	"checkout.quoteChanged",
	"checkout.termsNotAccepted",
	"checkout.selfPurchase",
	"order.notFound",
	"order.invalidTransition",
	"order.shopUnavailable",
	"order.codUnavailable",
	"order.buyerCapReached",
	"order.shopCapReached",
	"order.acceptDeadlinePassed",
	"order.reasonRequired",
	"order.confirmationCodeInvalid",
	"order.confirmationCodeExpired",
	"order.codeResendLimit",
	"order.handoverCodeInvalid",
	"order.handoverLocked",
	"order.contestWindowClosed",
	"order.withdrawalWindowClosed",
	"order.withdrawalAlreadyRequested",
	"commission.invoiceNotFound",
	"commission.alreadyPaid",
	"account.openOrders",
	"account.unpaidCommission",
] as const;

describe("P4 error codes", () => {
	it("declares all thirty-three", () => {
		const declared = new Set(Object.values(ERROR_CODES));
		for (const code of P4_CODES) expect(declared.has(code)).toBe(true);
		expect(P4_CODES.length).toBe(33);
	});
});

/** P5's contracts list, transcribed. Not derived from ERROR_CODES. */
const P5_CODES = [
	"payment.protectedDisabled",
	"payment.marketUnavailable",
	"payment.shopNotEligible",
	"payment.orderNotPayable",
	"payment.attemptInProgress",
	"payment.tooManyAttempts",
	"payment.channelUnsupported",
	"payment.amountTooHigh",
	"payment.selfPurchase",
	"payment.declined",
	"payment.insufficientFunds",
	"payment.timeout",
	"payment.limitExceeded",
	"payment.expired",
	"payout.ownerOnly",
	"payout.methodUnavailable",
	"payout.accountInvalid",
	"payout.accountNameMismatch",
	"payout.accountChangeCooldown",
	"payout.onboardingIncomplete",
	"payout.holdActive",
	"refund.amountExceeds",
	"refund.notRefundable",
	"refund.windowExpired",
] as const;

describe("P5 error codes", () => {
	it("declares all twenty-four, every one client-facing", () => {
		const declared = new Set(Object.values(ERROR_CODES));
		const missing = P5_CODES.filter((code) => !declared.has(code));
		expect(missing).toEqual([]);
		expect(P5_CODES.length).toBe(24);
		expect(P5_CODES.filter((code) => clientFacing.includes(code))).toHaveLength(
			24,
		);
	});
});

/** P6's contracts list, transcribed. Not derived from ERROR_CODES. */
const P6_CODES = [
	"return.notEligible",
	"return.windowClosed",
	"return.itemsInvalid",
	"return.alreadyOpen",
	"return.invalidTransition",
	"return.deductionEvidenceRequired",
	"return.deductionNotAllowed",
	"return.refundProofInvalid",
	"dispute.disabled",
	"dispute.notParty",
	"dispute.reasonNotAllowed",
	"dispute.windowClosed",
	"dispute.alreadyOpen",
	"dispute.returnCaseActive",
	"dispute.evidenceRequired",
	"dispute.evidenceLimit",
	"dispute.invalidTransition",
	"dispute.proposalInvalid",
	"dispute.refundExceedsOrder",
] as const;

describe("P6 error codes", () => {
	it("declares all nineteen, every one client-facing", () => {
		const declared = new Set(Object.values(ERROR_CODES));
		const missing = P6_CODES.filter((code) => !declared.has(code));
		expect(missing).toEqual([]);
		expect(P6_CODES.length).toBe(19);
		expect(P6_CODES.filter((code) => clientFacing.includes(code))).toHaveLength(
			19,
		);
	});
});

/** P7's contracts list, transcribed. Not derived from ERROR_CODES. */
const P7_CODES = [
	"delivery.zoneInvalid",
	"delivery.zoneOverlap",
	"delivery.zoneLimitReached",
	"delivery.cityNotLaunched",
	"delivery.locationInvalid",
	"delivery.locationLimitReached",
	"delivery.noActiveOption",
	"shipment.notFound",
	"shipment.invalidTransition",
	"shipment.maxAttemptsReached",
	"shipment.photoRequired",
	"shipment.rescheduleWindowClosed",
	"shipment.rescheduleDateInvalid",
	"shipment.riderLinkInvalid",
	"shipment.notAssigned",
	"shipment.riderConsentMissing",
	"courier.unavailable",
	"courier.notConfigured",
	"courier.cityNotServed",
	"courier.providerError",
	"courier.cancelRefused",
] as const;

describe("P7 error codes", () => {
	it("declares all twenty-one, every one client-facing", () => {
		const declared = new Set(Object.values(ERROR_CODES));
		const missing = P7_CODES.filter((code) => !declared.has(code));
		expect(missing).toEqual([]);
		expect(P7_CODES.length).toBe(21);
		expect(P7_CODES.filter((code) => clientFacing.includes(code))).toHaveLength(
			21,
		);
	});
});
