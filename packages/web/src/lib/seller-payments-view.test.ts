import { describe, expect, test } from "bun:test";
import type {
	PaymentHoldView,
	SellerPaymentAmounts,
	SellerPaymentOrderRow,
} from "~/types/payments";
import {
	amountStripRows,
	holdRows,
	sellerOrderRows,
} from "./seller-payments-view";

const AMOUNTS: SellerPaymentAmounts = {
	awaitingDelivery: 12_000,
	inWithdrawalPeriod: 5_000,
	readyForPayout: 3_000,
	// Deliberately NOT the sum of any payout row a test double might carry —
	// if the screen ever summed payouts instead of reading this field, this
	// value (a prime, nothing else in this fixture divides into) would catch
	// it immediately.
	payoutInTransit: 7_919,
	paidThisMonth: 40_000,
	currency: "XAF",
};

describe("amountStripRows", () => {
	test("renders the five figures in the spec's own order, verbatim off the wire", () => {
		expect(amountStripRows(AMOUNTS)).toEqual([
			{ key: "awaitingDelivery", amount: 12_000 },
			{ key: "inWithdrawalPeriod", amount: 5_000 },
			{ key: "readyForPayout", amount: 3_000 },
			{ key: "payoutInTransit", amount: 7_919 },
			{ key: "paidThisMonth", amount: 40_000 },
		]);
	});

	test("carries a null readyForPayout through as null, never coerced to 0", () => {
		const rows = amountStripRows({ ...AMOUNTS, readyForPayout: null });
		expect(rows.find((row) => row.key === "readyForPayout")?.amount).toBeNull();
	});
});

describe("sellerOrderRows", () => {
	/**
	 * `goods + delivery - commissionHt - vat` here is 1000 + 200 - 50 - 10 =
	 * 1140, not 777. A client that recomputed `netToYou` from the other four
	 * columns instead of reading the server's own figure would report 1140 —
	 * this test is red the moment that happens.
	 */
	const ORDER: SellerPaymentOrderRow = {
		orderId: "ord_1",
		orderNumber: "BNS-1001",
		goods: 1_000,
		delivery: 200,
		commissionHt: 50,
		vat: 10,
		netToYou: 777,
		status: "delivered",
		releaseDate: "2026-10-10T00:00:00.000Z",
	};

	test("keeps the server's netToYou exactly, not a client-side sum", () => {
		const [row] = sellerOrderRows([ORDER]);
		expect(row?.netToYou).toBe(777);
	});

	test("passes every column through unchanged, in order", () => {
		expect(sellerOrderRows([ORDER])).toEqual([ORDER]);
	});
});

describe("holdRows", () => {
	const HOLD: PaymentHoldView = {
		scope: "order",
		reasonCategory: "security",
		until: "2026-11-01T00:00:00.000Z",
	};

	test("maps the category to its label and description keys, carrying no amount", () => {
		expect(holdRows([HOLD])).toEqual([
			{
				scope: "order",
				labelKey: "holdCategory_security",
				descriptionKey: "holdCategoryBody_security",
				until: "2026-11-01T00:00:00.000Z",
			},
		]);
		expect(holdRows([HOLD])[0]).not.toHaveProperty("amount");
		expect(holdRows([HOLD])[0]).not.toHaveProperty("orderId");
	});

	test("every category round-trips to its own pair of keys", () => {
		const categories: PaymentHoldView["reasonCategory"][] = [
			"security",
			"review",
			"operations",
		];
		const rows = holdRows(
			categories.map((reasonCategory) => ({
				scope: "shop" as const,
				reasonCategory,
				until: null,
			})),
		);
		expect(rows.map((row) => row.labelKey)).toEqual([
			"holdCategory_security",
			"holdCategory_review",
			"holdCategory_operations",
		]);
	});
});
