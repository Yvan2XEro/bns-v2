import { describe, expect, test } from "bun:test";
import type { SellerPaymentsView } from "~/types/payments";
import { paymentsCsv } from "./payments-export";

const view: SellerPaymentsView = {
	amounts: {
		awaitingDelivery: 0,
		inWithdrawalPeriod: 0,
		readyForPayout: 0,
		payoutInTransit: 0,
		paidThisMonth: 0,
		currency: "EUR",
	},
	payouts: [
		{
			id: "po-1",
			date: "2026-09-15T08:00:00.000Z",
			amount: 312_087,
			fee: 0,
			destinationMasked: "****18",
			status: "complete",
			orderCount: 3,
			commissionHt: 27_600,
			vat: 5_313,
			gross: 345_000,
		},
	],
	orders: [
		{
			orderId: "o-1",
			orderNumber: "BNS-1",
			goods: 100_000,
			delivery: 2_000,
			commissionHt: 8_000,
			vat: 1_540,
			netToYou: 92_460,
			status: "delivered",
			releaseDate: null,
		},
	],
	holds: [],
};

describe("paymentsCsv", () => {
	test("writes payouts then orders with raw amounts", () => {
		const csv = paymentsCsv(view, {
			header: ["k", "ref", "d", "g", "c", "v", "f", "n", "s", "cur"],
			payoutKind: "payout",
			orderKind: "order",
			payoutStatus: (status) => `S:${status}`,
		});
		expect(csv.split("\r\n").slice(1, 3)).toEqual([
			"payout,po-1,2026-09-15,345000,27600,5313,0,312087,S:complete,EUR",
			"order,BNS-1,,102000,8000,1540,,92460,delivered,EUR",
		]);
	});
});
