import { describe, expect, test } from "bun:test";
import { timeAgo } from "./time-ago";

const now = new Date("2026-10-15T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
/** Intl spaces French units with a narrow no-break space. */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

describe("timeAgo", () => {
	test("speaks the locale, not English suffixes", () => {
		expect(plain(timeAgo(ago(5 * 3_600_000), "fr", { now }))).toBe(
			"il y a 5 h",
		);
		expect(plain(timeAgo(ago(5 * 3_600_000), "en", { now }))).toBe("5 hr. ago");
	});
	test("falls back to the date past maxDays", () => {
		expect(timeAgo(ago(10 * 86_400_000), "fr", { now })).toBe(
			new Date(ago(10 * 86_400_000)).toLocaleDateString("fr"),
		);
	});
});
