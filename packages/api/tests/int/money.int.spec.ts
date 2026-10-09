// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	formatMoney,
	formatMoneyFallback,
	type MoneyFormat,
} from "../../src/contracts/money";
import { roundHalfUp } from "../../src/lib/orderMath";
import { roundMinor } from "../../src/lib/paymentMath";
import { CM_FORMATTING } from "../../src/migrations/p10Markets";

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
		[47000, CM_FR, "47\u202F000 FCFA"],
		[47000, CM_EN, "XAF 47,000"],
		[0, CM_FR, "0 FCFA"],
		[0, CM_EN, "XAF 0"],
		[1410, CM_FR, "1\u202F410 FCFA"],
		[1410, CM_EN, "XAF 1,410"],
		[-47000, CM_FR, "-47\u202F000 FCFA"],
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

	it("equals roundHalfUp on 1,000 values", () => {
		for (let i = 0; i < 1000; i++) {
			const v = (i - 500) * 0.37 + (i % 2) * 0.5;
			expect(roundMinor(v, "half_up")).toBe(roundHalfUp(v));
		}
	});

	it("pins the CM fr byte sequence: U+202F inside digits, U+0020 before FCFA", () => {
		const out = formatMoney(47000, CM_FR);
		expect([...out].map((c) => c.codePointAt(0))).toEqual([
			0x34, 0x37, 0x202f, 0x30, 0x30, 0x30, 0x20, 0x46, 0x43, 0x46, 0x41,
		]);
	});
});

describe("the CM rows the migration seeds", () => {
	it("are the fixtures this file pins", () => {
		const { minorUnit: _fr, ...fr } = CM_FR;
		const { minorUnit: _en, ...en } = CM_EN;
		expect([...CM_FORMATTING]).toEqual([fr, en]);
	});
});
