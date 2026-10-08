// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	commissionForLine,
	invoiceTotals,
	netting,
	roundHalfUp,
	sumCommission,
	vatOf,
	weekBoundsDouala,
} from "../../src/lib/orderMath";

describe("roundHalfUp", () => {
	it("rounds .5 away from zero, where Math.round rounds -0.5 up", () => {
		expect(roundHalfUp(0.5)).toBe(1);
		expect(roundHalfUp(1.5)).toBe(2);
		expect(roundHalfUp(2.5)).toBe(3);
		expect(roundHalfUp(-0.5)).toBe(-1);
		expect(roundHalfUp(1.4999)).toBe(1);
	});
});

describe("commissionForLine", () => {
	it("is 8% of the line, half up", () => {
		expect(commissionForLine(45_000, 800)).toBe(3_600);
		expect(commissionForLine(15_000, 800)).toBe(1_200);
		// 6 250 * 8% = 500 exactly; 6 256 * 8% = 500.48 -> 500; 6 257 -> 500.56 -> 501
		expect(commissionForLine(6_256, 800)).toBe(500);
		expect(commissionForLine(6_257, 800)).toBe(501);
	});

	it("honours a category override and a zero rate", () => {
		expect(commissionForLine(45_000, 500)).toBe(2_250);
		expect(commissionForLine(45_000, 0)).toBe(0);
	});

	it("rounds per line, not on the sum", () => {
		// Three lines of 6 257: per line 501 each = 1 503. On the sum it would
		// be round(18 771 * 8%) = 1 502 — one franc the seller would dispute.
		const lines = [
			{ lineSubtotal: 6_257, rateBps: 800 },
			{ lineSubtotal: 6_257, rateBps: 800 },
			{ lineSubtotal: 6_257, rateBps: 800 },
		];
		expect(sumCommission(lines)).toBe(1_503);
	});
});

describe("the spec's worked example", () => {
	it("gives 3 600 commission, 693 VAT and 4 293 due on a 45 000 subtotal", () => {
		const commissionTotal = sumCommission([
			{ lineSubtotal: 30_000, rateBps: 800 },
			{ lineSubtotal: 15_000, rateBps: 800 },
		]);
		expect(commissionTotal).toBe(3_600);
		expect(vatOf(commissionTotal, 1925)).toBe(693);
		expect(
			invoiceTotals({
				charges: 3_600,
				credits: 0,
				carryOver: 0,
				vatRateBps: 1925,
			}),
		).toEqual({ commissionTotal: 3_600, vatAmount: 693, totalDue: 4_293 });
	});

	it("excludes the delivery fee from the base", () => {
		// 45 000 goods + 2 000 delivery: the buyer pays 47 000, the base is 45 000.
		expect(commissionForLine(45_000, 800)).toBe(3_600);
		expect(commissionForLine(47_000, 800)).not.toBe(3_600);
	});
});

describe("netting", () => {
	it("rolls a total below the minimum into the next week", () => {
		expect(netting({ commissionTotal: 480, minInvoiceAmount: 500 })).toEqual({
			action: "roll_over",
			carryOver: 0,
		});
	});

	it("invoices exactly at the minimum", () => {
		expect(
			netting({ commissionTotal: 500, minInvoiceAmount: 500 }).action,
		).toBe("invoice");
	});

	it("turns a negative total into a carry-over credit instead of an invoice", () => {
		expect(netting({ commissionTotal: -1_200, minInvoiceAmount: 500 })).toEqual(
			{
				action: "credit_carry_over",
				carryOver: 1_200,
			},
		);
	});
});

describe("invoiceTotals", () => {
	it("subtracts credits and adds the carry-over before VAT", () => {
		expect(
			invoiceTotals({
				charges: 5_000,
				credits: 1_000,
				carryOver: -500,
				vatRateBps: 1925,
			}),
		).toEqual({ commissionTotal: 3_500, vatAmount: 674, totalDue: 4_174 });
	});

	it("excludes refusal compensation credits from the VAT base only", () => {
		expect(
			invoiceTotals({
				charges: 2_000,
				credits: 500,
				nonVatCredits: 500,
				carryOver: 0,
				vatRateBps: 1925,
			}),
		).toEqual({ commissionTotal: 1_500, vatAmount: 385, totalDue: 1_885 });
	});
});

describe("weekBoundsDouala", () => {
	it("runs Monday 00:00 to Sunday 23:59:59.999 in Africa/Douala", () => {
		// Monday 2026-10-05 06:00 Douala = 05:00Z. The week it closes is the
		// previous one: Mon 2026-09-28 00:00 to Sun 2026-10-04 23:59:59.999 local.
		const { periodStart, periodEnd } = weekBoundsDouala(
			new Date("2026-10-05T05:00:00.000Z"),
		);
		expect(periodStart).toBe("2026-09-27T23:00:00.000Z");
		expect(periodEnd).toBe("2026-10-04T22:59:59.999Z");
	});

	it("gives a Sunday caller the same week as the Saturday before it", () => {
		const sat = weekBoundsDouala(new Date("2026-10-10T12:00:00.000Z"));
		const sun = weekBoundsDouala(new Date("2026-10-11T12:00:00.000Z"));
		expect(sun).toEqual(sat);
	});
});
