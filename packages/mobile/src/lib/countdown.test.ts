import { describe, expect, test } from "bun:test";
import { formatCountdown, secondsUntil } from "./countdown";

describe("secondsUntil", () => {
	const now = Date.parse("2026-09-15T10:41:00.000Z");

	test("rounds up to the next whole second", () => {
		expect(secondsUntil("2026-09-15T10:41:41.200Z", now)).toBe(42);
	});

	test("is zero for a past or missing date", () => {
		expect(secondsUntil("2026-09-15T10:40:00.000Z", now)).toBe(0);
		expect(secondsUntil(null, now)).toBe(0);
	});
});

describe("formatCountdown", () => {
	test("renders m:ss", () => {
		expect(formatCountdown(42)).toBe("0:42");
		expect(formatCountdown(65)).toBe("1:05");
	});
});
