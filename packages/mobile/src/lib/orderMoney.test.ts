import { describe, expect, test } from "bun:test";
import { formatOrderDate } from "./orderMoney";

describe("formatOrderDate", () => {
	test("renders a readable date containing the year", () => {
		const rendered = formatOrderDate("2026-10-03T12:00:00.000Z", "en");
		expect(rendered).toContain("2026");
	});
});
