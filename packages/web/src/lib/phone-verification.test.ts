import { describe, expect, test } from "bun:test";
import {
	formatCountdown,
	phoneNumberSchema,
	secondsUntil,
	verificationCodeSchema,
} from "./phone-verification";

describe("secondsUntil", () => {
	test("a resendAvailableAt already in the past yields 0", () => {
		const past = new Date(Date.now() - 5_000).toISOString();
		expect(secondsUntil(past)).toBe(0);
	});

	test("a resendAvailableAt in the future yields the remaining whole seconds", () => {
		const now = Date.now();
		const future = new Date(now + 30_000).toISOString();
		expect(secondsUntil(future, now)).toBe(30);
	});

	// The regression this guards: a countdown started from a mount-time tick
	// forgets everything on remount or after the tab is backgrounded. Deriving
	// the remainder from the absolute server timestamp instead means calling
	// this twice, at two different "now"s, against the *same* target still
	// gives the right answer with no state carried between the calls.
	test("survives a remount mid-countdown: recomputed from the same absolute timestamp, not a mount-time tick", () => {
		const start = Date.now();
		const target = new Date(start + 20_000).toISOString();

		const beforeRemount = secondsUntil(target, start + 5_000);
		const afterRemount = secondsUntil(target, start + 12_000);

		expect(beforeRemount).toBe(15);
		expect(afterRemount).toBe(8);
	});

	test("a null timestamp means no wait", () => {
		expect(secondsUntil(null)).toBe(0);
	});

	test("a malformed timestamp means no wait", () => {
		expect(secondsUntil("not-a-date")).toBe(0);
	});
});

describe("formatCountdown", () => {
	test("formats minutes and seconds, zero-padded", () => {
		expect(formatCountdown(65)).toBe("1:05");
	});

	test("formats under a minute", () => {
		expect(formatCountdown(8)).toBe("0:08");
	});
});

describe("verificationCodeSchema", () => {
	test("accepts a 6-digit code", () => {
		expect(verificationCodeSchema.safeParse({ code: "123456" }).success).toBe(
			true,
		);
	});

	// Regression guard: a code field is free text (paste, autofill, a physical
	// keyboard) despite inputMode="numeric". Each of these must be rejected
	// client-side rather than sent to the server as a doomed "invalid code".
	test("rejects a malformed code", () => {
		expect(verificationCodeSchema.safeParse({ code: "12a456" }).success).toBe(
			false,
		);
		expect(verificationCodeSchema.safeParse({ code: "12345" }).success).toBe(
			false,
		);
		expect(verificationCodeSchema.safeParse({ code: "1234567" }).success).toBe(
			false,
		);
		expect(verificationCodeSchema.safeParse({ code: "" }).success).toBe(false);
	});
});

describe("phoneNumberSchema", () => {
	test("accepts an international-looking number", () => {
		expect(
			phoneNumberSchema.safeParse({ phone: "+237677504218" }).success,
		).toBe(true);
	});

	test("rejects a too-short input", () => {
		expect(phoneNumberSchema.safeParse({ phone: "12345" }).success).toBe(false);
	});

	test("rejects a blank input", () => {
		expect(phoneNumberSchema.safeParse({ phone: "  " }).success).toBe(false);
	});
});
