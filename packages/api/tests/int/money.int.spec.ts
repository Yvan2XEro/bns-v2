// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	formatMoney,
	formatMoneyFallback,
	type MoneyFormat,
} from "../../src/contracts/money";
import { roundHalfUp } from "../../src/lib/orderMath";
import { roundMinor, roundXaf } from "../../src/lib/paymentMath";

// The two CM format rows Task 7 seeds.
const CM_FR: MoneyFormat = {
	locale: "fr",
	symbol: "FCFA",
	position: "after",
	groupSeparator: " ",
	decimalSeparator: ",",
	minorUnit: 0,
};
const CM_EN: MoneyFormat = {
	locale: "en",
	symbol: "XAF",
	position: "before",
	groupSeparator: ",",
	decimalSeparator: ".",
	minorUnit: 0,
};
const DECIMAL: MoneyFormat = {
	locale: "en",
	symbol: "F",
	position: "before",
	groupSeparator: ",",
	decimalSeparator: ".",
	minorUnit: 2,
};

describe("formatMoney", () => {
	it.each([
		[47000, CM_FR, "47 000 FCFA"],
		[47000, CM_EN, "XAF 47,000"],
		[0, CM_FR, "0 FCFA"],
		[0, CM_EN, "XAF 0"],
		[1410, CM_FR, "1 410 FCFA"],
		[1410, CM_EN, "XAF 1,410"],
		[-47000, CM_FR, "-47 000 FCFA"],
		[-47000, CM_EN, "-XAF 47,000"],
		[123456, DECIMAL, "F 1,234.56"],
		[5, DECIMAL, "F 0.05"],
	])("%s -> %j", (amount, format, expected) => {
		expect(formatMoney(amount, format)).toBe(expected);
	});
});

describe("formatMoneyFallback", () => {
	it("never reads as FCFA", () => {
		expect(formatMoneyFallback(1410, "XAF", 0)).toBe("XAF 1 410");
		expect(formatMoneyFallback(123456, "EUR", 2)).toBe("EUR 1 234.56");
	});
});

describe("roundMinor", () => {
	it("applies each rule at the half boundary", () => {
		expect(roundMinor(2.5, "half_up")).toBe(3);
		expect(roundMinor(2.5, "half_even")).toBe(2);
		expect(roundMinor(3.5, "half_even")).toBe(4);
		expect(roundMinor(2.9, "down")).toBe(2);
		expect(roundMinor(-2.9, "down")).toBe(-2);
		expect(roundMinor(-2.5, "half_up")).toBe(-3);
		expect(roundMinor(-2.5, "half_even")).toBe(-2);
	});

	it("equals roundHalfUp on 1,000 values, and roundXaf is the alias", () => {
		for (let i = 0; i < 1000; i++) {
			const v = (i - 500) * 0.37 + (i % 2) * 0.5;
			expect(roundMinor(v, "half_up")).toBe(roundHalfUp(v));
			expect(roundXaf(v)).toBe(roundHalfUp(v));
		}
	});
});
