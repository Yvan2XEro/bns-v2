// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	businessDaysAfter,
	type CaseBasis,
	type CaseBreakdownSettings,
	caseBreakdown,
	commissionCredit,
	deductionAllowed,
	roundXaf,
	splitAllocation,
} from "../../src/lib/caseMath";
import { commissionForLine } from "../../src/lib/orderMath";
import {
	roundXaf as paymentRoundXaf,
	splitAmounts,
} from "../../src/lib/paymentMath";

/**
 * The worked order every fixture derives from (spec l.249), computed by
 * `splitAmounts`/`commissionForLine` so the fixtures cannot drift from the
 * money-math module they exercise: goods 40,000 + delivery 2,000 = 42,000,
 * commission 3,200 HT + 616 VAT at 19.25%, protected fee 1,260.
 */
const VAT_RATE_BPS = 1_925;
const ORDER_DELIVERY_FEE = 2_000;
const GOODS = 40_000;
const COMMISSION_RATE_BPS = 800; // 40,000 * 800/10,000 = 3,200
const commissionHt = commissionForLine(GOODS, COMMISSION_RATE_BPS);
const split = splitAmounts({
	orderTotal: GOODS + ORDER_DELIVERY_FEE,
	commission: commissionHt,
	vatRateBps: VAT_RATE_BPS,
	protection: { bps: 300, min: 100, max: 15_000 },
});
const PROTECTED_FEE = split.buyerProtectionFee;

const settingsOn: CaseBreakdownSettings = {
	refundOutboundDeliveryOnWithdrawal: true,
	maxReturnShippingReimbursement: 5_000,
};
const settingsOff: CaseBreakdownSettings = {
	...settingsOn,
	refundOutboundDeliveryOnWithdrawal: false,
};

describe("worked order fixture", () => {
	it("matches the spec's numbers", () => {
		expect(commissionHt).toBe(3_200);
		expect(PROTECTED_FEE).toBe(1_260);
	});
});

describe("caseBreakdown", () => {
	it("withdrawal, partial: refunds only the item, nothing else", () => {
		expect(
			caseBreakdown({
				basis: "withdrawal",
				goods: 15_000,
				fullOrder: false,
				orderDeliveryFee: ORDER_DELIVERY_FEE,
				documentedReturnShipping: 0,
				returnShippingPaidBy: null,
				buyerProtectionFee: 0,
				deduction: 0,
				settings: settingsOn,
			}),
		).toEqual({
			goods: 15_000,
			outboundDelivery: 0,
			returnShipping: 0,
			buyerProtectionFee: 0,
			deduction: 0,
			amount: 15_000,
		});
	});

	it("withdrawal, full, setting on: outbound delivery is refunded", () => {
		const result = caseBreakdown({
			basis: "withdrawal",
			goods: GOODS,
			fullOrder: true,
			orderDeliveryFee: ORDER_DELIVERY_FEE,
			documentedReturnShipping: 0,
			returnShippingPaidBy: null,
			buyerProtectionFee: 0,
			deduction: 0,
			settings: settingsOn,
		});
		expect(result.outboundDelivery).toBe(2_000);
		expect(result.amount).toBe(42_000);
	});

	it("withdrawal, full, setting off: outbound delivery is not refunded", () => {
		const result = caseBreakdown({
			basis: "withdrawal",
			goods: GOODS,
			fullOrder: true,
			orderDeliveryFee: ORDER_DELIVERY_FEE,
			documentedReturnShipping: 0,
			returnShippingPaidBy: null,
			buyerProtectionFee: 0,
			deduction: 0,
			settings: settingsOff,
		});
		expect(result.outboundDelivery).toBe(0);
		expect(result.amount).toBe(40_000);
	});

	it("non_conformity, full, protected: return shipping capped, fee applies", () => {
		const result = caseBreakdown({
			basis: "non_conformity",
			goods: GOODS,
			fullOrder: true,
			orderDeliveryFee: ORDER_DELIVERY_FEE,
			documentedReturnShipping: 6_500,
			returnShippingPaidBy: "seller",
			buyerProtectionFee: PROTECTED_FEE,
			deduction: 0,
			settings: settingsOn,
		});
		expect(result).toEqual({
			goods: 40_000,
			outboundDelivery: 2_000,
			returnShipping: 5_000,
			buyerProtectionFee: 1_260,
			deduction: 0,
			amount: 48_260,
		});
	});

	it("non_conformity, full, COD: same breakdown but no fee", () => {
		const result = caseBreakdown({
			basis: "non_conformity",
			goods: GOODS,
			fullOrder: true,
			orderDeliveryFee: ORDER_DELIVERY_FEE,
			documentedReturnShipping: 6_500,
			returnShippingPaidBy: "seller",
			buyerProtectionFee: 0,
			deduction: 0,
			settings: settingsOn,
		});
		expect(result).toEqual({
			goods: 40_000,
			outboundDelivery: 2_000,
			returnShipping: 5_000,
			buyerProtectionFee: 0,
			deduction: 0,
			amount: 47_000,
		});
	});

	it("return shipping is 0 when the buyer pays, however large the documented cost", () => {
		const result = caseBreakdown({
			basis: "non_conformity",
			goods: GOODS,
			fullOrder: true,
			orderDeliveryFee: ORDER_DELIVERY_FEE,
			documentedReturnShipping: 6_500,
			returnShippingPaidBy: "buyer",
			buyerProtectionFee: 0,
			deduction: 0,
			settings: settingsOn,
		});
		expect(result.returnShipping).toBe(0);
		expect(result.amount).toBe(42_000);
	});

	it.each<CaseBasis>([
		"late_delivery",
		"unavailable",
	])("%s refunds full outbound delivery even with the withdrawal setting off", (basis) => {
		expect(
			caseBreakdown({
				basis,
				goods: GOODS,
				fullOrder: true,
				orderDeliveryFee: ORDER_DELIVERY_FEE,
				documentedReturnShipping: 1_500,
				returnShippingPaidBy: "seller",
				buyerProtectionFee: PROTECTED_FEE,
				deduction: 0,
				settings: settingsOff,
			}),
		).toEqual({
			goods: 40_000,
			outboundDelivery: 2_000,
			returnShipping: 1_500,
			buyerProtectionFee: 1_260,
			deduction: 0,
			amount: 44_760,
		});
	});

	it("partial protected non-conformity refunds exclude outbound delivery and the protection fee", () => {
		expect(
			caseBreakdown({
				basis: "non_conformity",
				goods: 15_000,
				fullOrder: false,
				orderDeliveryFee: ORDER_DELIVERY_FEE,
				documentedReturnShipping: 1_500,
				returnShippingPaidBy: "seller",
				buyerProtectionFee: PROTECTED_FEE,
				deduction: 0,
				settings: settingsOn,
			}),
		).toEqual({
			goods: 15_000,
			outboundDelivery: 0,
			returnShipping: 1_500,
			buyerProtectionFee: 0,
			deduction: 0,
			amount: 16_500,
		});
	});

	it("deduction reduces goods net of the deduction", () => {
		const result = caseBreakdown({
			basis: "withdrawal",
			goods: 15_000,
			fullOrder: false,
			orderDeliveryFee: ORDER_DELIVERY_FEE,
			documentedReturnShipping: 0,
			returnShippingPaidBy: null,
			buyerProtectionFee: 0,
			deduction: 4_000,
			settings: settingsOn,
		});
		expect(result.goods).toBe(11_000);
		expect(result.amount).toBe(11_000);
	});

	it("property: 500 random cases hold the breakdown invariants", () => {
		let state = 0x6c61_7365;
		const next = () => {
			state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
			return state / 0x1_0000_0000;
		};
		const bases: CaseBasis[] = [
			"withdrawal",
			"non_conformity",
			"late_delivery",
			"unavailable",
		];

		let checked = 0;
		for (let i = 0; i < 500; i++) {
			const basis = bases[Math.floor(next() * bases.length)];
			if (basis === undefined) throw new Error("Invalid generated basis index");
			const goods = Math.floor(next() * 100_000) + 1;
			const deduction =
				basis === "non_conformity" ? 0 : Math.floor(next() * (goods + 1));
			const fullOrder = next() < 0.5;
			const orderDeliveryFee = Math.floor(next() * 5_000);
			const documentedReturnShipping = Math.floor(next() * 10_000);
			const returnShippingPaidBy =
				next() < 0.5 ? "seller" : next() < 0.5 ? "buyer" : null;
			const protectedOrder = next() < 0.5;
			const buyerProtectionFee = protectedOrder
				? Math.floor(next() * 15_000) + 1
				: 0;
			const settings: CaseBreakdownSettings = {
				refundOutboundDeliveryOnWithdrawal: next() < 0.5,
				maxReturnShippingReimbursement: Math.floor(next() * 10_000),
			};

			const result = caseBreakdown({
				basis,
				goods,
				fullOrder,
				orderDeliveryFee,
				documentedReturnShipping,
				returnShippingPaidBy,
				buyerProtectionFee,
				deduction,
				settings,
			});

			expect(
				result.goods +
					result.outboundDelivery +
					result.returnShipping +
					result.buyerProtectionFee,
			).toBe(result.amount);
			expect(Number.isInteger(result.goods)).toBe(true);
			expect(Number.isInteger(result.outboundDelivery)).toBe(true);
			expect(Number.isInteger(result.returnShipping)).toBe(true);
			expect(Number.isInteger(result.buyerProtectionFee)).toBe(true);
			expect(Number.isInteger(result.amount)).toBe(true);
			expect(Number.isInteger(result.deduction)).toBe(true);
			expect(result.goods).toBeGreaterThanOrEqual(0);
			expect(result.deduction).toBeGreaterThanOrEqual(0);
			expect(result.amount).toBeGreaterThanOrEqual(0);
			expect(result.outboundDelivery).toBeGreaterThanOrEqual(0);
			expect(result.returnShipping).toBeGreaterThanOrEqual(0);
			expect(result.buyerProtectionFee).toBeGreaterThanOrEqual(0);
			expect(result.goods).toBe(goods - deduction);
			expect(result.outboundDelivery).toBe(
				fullOrder &&
					(basis !== "withdrawal" ||
						settings.refundOutboundDeliveryOnWithdrawal)
					? orderDeliveryFee
					: 0,
			);
			expect(result.returnShipping).toBe(
				returnShippingPaidBy === "seller"
					? Math.min(
							documentedReturnShipping,
							settings.maxReturnShippingReimbursement,
						)
					: 0,
			);
			expect(result.buyerProtectionFee).toBe(
				fullOrder ? buyerProtectionFee : 0,
			);
			if (!(fullOrder && protectedOrder)) {
				expect(result.buyerProtectionFee).toBe(0);
			} else {
				expect(result.buyerProtectionFee).toBeGreaterThan(0);
			}
			checked++;
		}

		expect(checked).toBe(500);
	});
});

describe("splitAllocation", () => {
	it("goes to goods only when the amount fits inside goods", () => {
		expect(
			splitAllocation({
				refundAmount: 10_000,
				goods: GOODS,
				orderDeliveryFee: ORDER_DELIVERY_FEE,
			}),
		).toEqual({ goods: 10_000, outboundDelivery: 0, buyerProtectionFee: 0 });
	});

	it("spills into delivery once goods are exhausted", () => {
		expect(
			splitAllocation({
				refundAmount: 41_500,
				goods: GOODS,
				orderDeliveryFee: ORDER_DELIVERY_FEE,
			}),
		).toEqual({
			goods: 40_000,
			outboundDelivery: 1_500,
			buyerProtectionFee: 0,
		});
	});

	it("throws above goods + delivery", () => {
		expect(() =>
			splitAllocation({
				refundAmount: 42_001,
				goods: GOODS,
				orderDeliveryFee: ORDER_DELIVERY_FEE,
			}),
		).toThrow();
	});
});

describe("deductionAllowed", () => {
	it("refuses entirely for non_conformity", () => {
		expect(
			deductionAllowed({
				basis: "non_conformity",
				itemPrice: 15_000,
				amount: 1_000,
			}),
		).toEqual({ ok: false, code: "return.deductionNotAllowed" });
	});

	it("refuses an amount above the item price", () => {
		expect(
			deductionAllowed({
				basis: "withdrawal",
				itemPrice: 15_000,
				amount: 15_001,
			}),
		).toEqual({ ok: false, code: "return.itemsInvalid" });
	});

	it("allows a deduction at or below the item price for other bases", () => {
		expect(
			deductionAllowed({
				basis: "withdrawal",
				itemPrice: 15_000,
				amount: 15_000,
			}),
		).toEqual({ ok: true });
	});
});

describe("commissionCredit", () => {
	it("rounds a half-franc credit up and uses the supplied invoice VAT rate", () => {
		expect(
			commissionCredit({
				commissionHt: 5,
				refundedGoods: 1,
				commissionBase: 2,
				vatRateBps: 5_000,
			}),
		).toEqual({ creditHt: 3, creditVat: 2, creditTtc: 5 });
	});
	it("prorates the credit on the refunded share of goods, VAT at the invoice rate", () => {
		expect(
			commissionCredit({
				commissionHt,
				refundedGoods: 15_000,
				commissionBase: GOODS,
				vatRateBps: VAT_RATE_BPS,
			}),
		).toEqual({ creditHt: 1_200, creditVat: 231, creditTtc: 1_431 });
	});
});

describe("roundXaf", () => {
	it("is paymentMath's roundXaf, not a copy", () => {
		expect(roundXaf).toBe(paymentRoundXaf);
		expect(roundXaf(0.5)).toBe(1);
		expect(roundXaf(2.5)).toBe(3);
	});
});

describe("businessDaysAfter", () => {
	it("uses the Douala weekday when UTC is still Sunday", () => {
		const start = new Date("2026-10-11T23:30:00.000Z"); // Monday 00:30 Douala
		expect(businessDaysAfter(start, 5).toISOString()).toBe(
			"2026-10-18T23:30:00.000Z",
		);
		expect(start.toISOString()).toBe("2026-10-11T23:30:00.000Z");
	});

	it("skips a weekend start and preserves the instant for zero business days", () => {
		const start = new Date("2026-10-10T14:00:00.000Z");
		expect(businessDaysAfter(start, 1).toISOString()).toBe(
			"2026-10-12T14:00:00.000Z",
		);
		expect(businessDaysAfter(start, 0).toISOString()).toBe(start.toISOString());
	});
	it("Thursday + 5 business days crosses one weekend to the following Thursday", () => {
		const start = new Date("2026-10-08T14:00:00.000Z"); // Thu 15:00 Africa/Douala
		const result = businessDaysAfter(start, 5);
		expect(result.toISOString()).toBe("2026-10-15T14:00:00.000Z"); // Thu 15:00
	});

	it("a Friday-evening start crosses into the second week", () => {
		const start = new Date("2026-10-09T19:00:00.000Z"); // Fri 20:00 Africa/Douala
		const result = businessDaysAfter(start, 5);
		expect(result.toISOString()).toBe("2026-10-16T19:00:00.000Z"); // Fri 20:00, one week later
	});
});
