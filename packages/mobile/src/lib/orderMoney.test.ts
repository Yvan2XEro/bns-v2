import { describe, expect, test } from "bun:test";
import { formatOrderDate, formatXaf } from "./orderMoney";

/**
 * The table that actually proves this copy matches the API and web lives in
 * `packages/api/tests/int/order-format-parity.int.spec.ts`. This file only
 * pins the narrow no-break space in the French branch, the one character a
 * plain-space regression would otherwise pass silently.
 */
describe("formatXaf", () => {
	test("groups thousands with a narrow no-break space in French", () => {
		expect(formatXaf(47000, "fr")).toBe("47 000 FCFA");
	});

	test("groups thousands with a comma in English", () => {
		expect(formatXaf(47000, "en")).toBe("XAF 47,000");
	});

	test("renders zero and small amounts without a separator", () => {
		expect(formatXaf(0, "fr")).toBe("0 FCFA");
		expect(formatXaf(999, "en")).toBe("XAF 999");
	});

	test("renders a negative amount with a leading minus", () => {
		expect(formatXaf(-1200, "fr")).toBe("-1 200 FCFA");
	});
});

describe("formatOrderDate", () => {
	test("renders a readable date containing the year", () => {
		const rendered = formatOrderDate("2026-10-03T12:00:00.000Z", "en");
		expect(rendered).toContain("2026");
	});
});
