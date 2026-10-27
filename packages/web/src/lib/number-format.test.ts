import { describe, expect, test } from "bun:test";
import { digitsOf, groupSeparator } from "./number-format";

describe("number fields", () => {
	test("group thousands the way the language writes them", () => {
		expect(groupSeparator("en")).toBe(",");
		expect(groupSeparator("fr")).toMatch(/^\s$/u);
	});

	test("hand the form plain digits", () => {
		expect(digitsOf("1 250 000")).toBe("1250000");
		expect(digitsOf("1,250")).toBe("1250");
		expect(digitsOf(42)).toBe("42");
		expect(digitsOf(null)).toBe("");
	});
});
