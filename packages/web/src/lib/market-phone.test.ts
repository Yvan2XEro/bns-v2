import { describe, expect, test } from "bun:test";
import { cmMarket } from "../test/market-fixture";
import { marketPhoneRule } from "./market-phone";

describe("marketPhoneRule", () => {
	test("accepts and refuses from the served pattern, with the served placeholder", () => {
		const rule = marketPhoneRule(cmMarket());
		expect(rule.pattern.test("+237650000001")).toBe(true);
		expect(rule.pattern.test("+23765000000")).toBe(false);
		expect(rule.placeholder).toBe("+237650000001");
	});

	test("data, not literal: a different served pattern changes the verdict", () => {
		const rule = marketPhoneRule(
			cmMarket({
				phone: { pattern: "^\\+33\\d{9}$", displayExample: "+33612345678" },
			}),
		);
		expect(rule.pattern.test("+33612345678")).toBe(true);
		expect(rule.pattern.test("+237650000001")).toBe(false);
		expect(rule.placeholder).toBe("+33612345678");
		expect(rule.example).toBe("+33612345678");
	});

	test("no market block falls back to the E.164 shape and no placeholder", () => {
		const rule = marketPhoneRule(undefined);
		expect(rule.pattern.test("+33612345678")).toBe(true);
		expect(rule.pattern.test("0612345678")).toBe(false);
		expect(rule.placeholder).toBeUndefined();
		expect(rule.example).toBe("+CCXXXXXXXX");
	});
});
