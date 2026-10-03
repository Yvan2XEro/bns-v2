// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	buyerProtectionFee,
	buyerProtectionFeeVat,
	CHANNEL_PHONE_PREFIXES,
	commissionVatOf,
	phoneMatchesChannel,
	roundXaf,
	splitAmounts,
} from "../../src/lib/paymentMath";

describe("roundXaf", () => {
	it("rounds half up at the .5 boundary", () => {
		expect(roundXaf(0.5)).toBe(1);
		expect(roundXaf(1.5)).toBe(2);
		expect(roundXaf(2.5)).toBe(3);
		expect(roundXaf(1.4999)).toBe(1);
		expect(roundXaf(0)).toBe(0);
	});
});

describe("buyerProtectionFee", () => {
	const protection = { bps: 300, min: 100, max: 15_000 };

	it("clamps a small order up to the minimum", () => {
		// 1 000 * 3% = 30, below the 100 floor.
		expect(buyerProtectionFee(1_000, protection)).toBe(100);
	});

	it("clamps a very large order down to the maximum", () => {
		// 10 000 000 * 3% = 300 000, capped at 15 000.
		expect(buyerProtectionFee(10_000_000, protection)).toBe(15_000);
	});

	it("applies the plain 3% rate in the midband", () => {
		expect(buyerProtectionFee(50_000, protection)).toBe(1_500);
	});
});

describe("buyerProtectionFeeVat", () => {
	it("extracts VAT from a TTC fee by exact value", () => {
		// 1500 - roundXaf(1500 * 10000 / 11925) = 1500 - 1258 = 242.
		expect(buyerProtectionFeeVat(1_500, 1_925)).toBe(242);
	});
});

describe("commissionVatOf", () => {
	it("is the commission's VAT at the configured rate", () => {
		expect(commissionVatOf(3_600, 1_925)).toBe(693);
	});
});

describe("splitAmounts", () => {
	it("balances applicationFee + destinationAmount against buyerTotal", () => {
		const result = splitAmounts({
			orderTotal: 50_000,
			commission: 3_600,
			vatRateBps: 1_925,
			protection: { bps: 300, min: 100, max: 15_000 },
		});
		expect(result.commission).toBe(3_600);
		expect(result.commissionVat).toBe(693);
		expect(result.buyerProtectionFee).toBe(1_500);
		expect(result.buyerProtectionFeeVat).toBe(242);
		expect(result.applicationFee).toBe(3_600 + 693 + 1_500);
		expect(result.destinationAmount).toBe(50_000 - 3_600 - 693);
		expect(result.buyerTotal).toBe(
			result.applicationFee + result.destinationAmount,
		);
	});

	it("property: 1 000 random orders hold the split invariants", () => {
		// No fast-check in the repo; a seeded LCG keeps this deterministic.
		let state = 0x2026_1003;
		const next = () => {
			state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
			return state / 0x7fffffff;
		};

		let checked = 0;
		for (let i = 0; i < 1_000; i++) {
			const orderTotal = Math.floor(next() * 5_000_000) + 100;
			const rateBps = Math.floor(next() * 2_000);
			const commission = roundXaf((orderTotal * rateBps) / 10_000);
			const vatRateBps = 1_925;
			const protection = { bps: 300, min: 100, max: 15_000 };

			const result = splitAmounts({
				orderTotal,
				commission,
				vatRateBps,
				protection,
			});

			expect(result.applicationFee + result.destinationAmount).toBe(
				result.buyerTotal,
			);
			expect(Number.isInteger(result.commission)).toBe(true);
			expect(Number.isInteger(result.commissionVat)).toBe(true);
			expect(Number.isInteger(result.buyerProtectionFee)).toBe(true);
			expect(Number.isInteger(result.buyerProtectionFeeVat)).toBe(true);
			expect(Number.isInteger(result.applicationFee)).toBe(true);
			expect(Number.isInteger(result.destinationAmount)).toBe(true);
			expect(result.commission).toBeGreaterThanOrEqual(0);
			expect(result.commissionVat).toBeGreaterThanOrEqual(0);
			expect(result.buyerProtectionFee).toBeGreaterThanOrEqual(0);
			expect(result.buyerProtectionFeeVat).toBeGreaterThanOrEqual(0);
			expect(result.applicationFee).toBeGreaterThanOrEqual(0);
			expect(result.destinationAmount).toBeGreaterThanOrEqual(0);
			expect(result.destinationAmount).toBeLessThanOrEqual(orderTotal);
			checked++;
		}

		expect(checked).toBe(1_000);
	});
});

describe("CHANNEL_PHONE_PREFIXES and phoneMatchesChannel", () => {
	it("exposes exactly the two launch channels", () => {
		expect(Object.keys(CHANNEL_PHONE_PREFIXES).sort()).toEqual([
			"cm.mtn",
			"cm.orange",
		]);
	});

	it("matches an MTN number in its ranges (650-654, 670-684)", () => {
		expect(phoneMatchesChannel("+237650123456", "cm.mtn")).toBe(true);
		expect(phoneMatchesChannel("+237678123456", "cm.mtn")).toBe(true);
		expect(phoneMatchesChannel("+237650123456", "cm.orange")).toBe(false);
	});

	it("matches an Orange number in its ranges (655-659, 690-699)", () => {
		expect(phoneMatchesChannel("+237655123456", "cm.orange")).toBe(true);
		expect(phoneMatchesChannel("+237694123456", "cm.orange")).toBe(true);
		expect(phoneMatchesChannel("+237655123456", "cm.mtn")).toBe(false);
	});

	it("accepts a local number without the +237 country code", () => {
		expect(phoneMatchesChannel("650123456", "cm.mtn")).toBe(true);
	});

	it("refuses a Cameroon landline for both channels", () => {
		expect(phoneMatchesChannel("+237233445566", "cm.mtn")).toBe(false);
		expect(phoneMatchesChannel("+237233445566", "cm.orange")).toBe(false);
	});
});
