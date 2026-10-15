import { describe, expect, test } from "bun:test";
import { daysUntil } from "./team-roster";

describe("daysUntil", () => {
	const now = new Date("2026-09-15T12:00:00.000Z");

	test("rounds a partial day up", () => {
		expect(daysUntil("2026-09-21T10:00:00.000Z", now)).toBe(6);
	});

	test("is zero once the date has passed", () => {
		expect(daysUntil("2026-09-15T11:00:00.000Z", now)).toBe(0);
	});
});
