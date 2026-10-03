import { describe, expect, test } from "bun:test";
import type { PaymentHoldView, SellerPaymentsView } from "../types/order";
import { notMeAccountId, sellerPaymentsActionCount } from "./sellerPayments";

function viewWithHolds(holds: PaymentHoldView[]): SellerPaymentsView {
	return {
		amounts: {
			awaitingDelivery: 0,
			inWithdrawalPeriod: 0,
			readyForPayout: 0,
			payoutInTransit: 0,
			paidThisMonth: 0,
			currency: "XAF",
		},
		payouts: [],
		orders: [],
		holds,
	};
}

const hold: PaymentHoldView = {
	scope: "shop",
	reasonCategory: "security",
	until: null,
};

describe("sellerPaymentsActionCount", () => {
	// Counts, not a boolean: a mutation that hardcodes `1` whenever a view is
	// present (instead of reading `holds.length`) would still pass a mere
	// truthy check but fails this against three distinct counts.
	test("mirrors the fetched view's number of holds, whatever it is", () => {
		expect(sellerPaymentsActionCount(viewWithHolds([]))).toBe(0);
		expect(sellerPaymentsActionCount(viewWithHolds([hold]))).toBe(1);
		expect(sellerPaymentsActionCount(viewWithHolds([hold, hold, hold]))).toBe(
			3,
		);
	});

	test("is zero before the view has loaded, not a stale badge", () => {
		expect(sellerPaymentsActionCount(undefined)).toBe(0);
	});
});

describe("notMeAccountId", () => {
	test("returns the account id when the shop param matches", () => {
		expect(
			notMeAccountId("shop-1", { shop: "shop-1", notMe: "account-1" }),
		).toBe("account-1");
	});

	test("refuses a link for a different shop", () => {
		expect(
			notMeAccountId("shop-1", { shop: "shop-2", notMe: "account-1" }),
		).toBeNull();
	});

	test("refuses when either param is missing", () => {
		expect(
			notMeAccountId("shop-1", { shop: null, notMe: "account-1" }),
		).toBeNull();
		expect(
			notMeAccountId("shop-1", { shop: "shop-1", notMe: null }),
		).toBeNull();
	});
});
