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
	test("accepts an E.164 number, exactly what PhoneInput emits", () => {
		expect(
			phoneNumberSchema.safeParse({ phone: "+237677504218" }).success,
		).toBe(true);
	});

	test("rejects a blank input", () => {
		expect(phoneNumberSchema.safeParse({ phone: "" }).success).toBe(false);
	});

	test("rejects a national number with no +", () => {
		expect(phoneNumberSchema.safeParse({ phone: "677504218" }).success).toBe(
			false,
		);
	});

	test("rejects a leading zero after the +, mirroring the server's [1-9]", () => {
		expect(
			phoneNumberSchema.safeParse({ phone: "+0237677504218" }).success,
		).toBe(false);
	});

	test("rejects internal spacing (PhoneInput never emits it, but the schema must catch it if something else does)", () => {
		expect(
			phoneNumberSchema.safeParse({ phone: "+237 677 504 218" }).success,
		).toBe(false);
	});

	// Mutation-checks the server's `[1-9]\d{7,14}` bound: a leading digit plus
	// 7 more is the shortest accepted shape, plus 14 more the longest; one
	// digit short or over on either end is rejected.
	test("accepts the server's shortest shape: a leading digit plus 7 more", () => {
		expect(phoneNumberSchema.safeParse({ phone: "+12345678" }).success).toBe(
			true,
		);
	});

	test("rejects a leading digit plus only 6 more, one short of the server's floor", () => {
		expect(phoneNumberSchema.safeParse({ phone: "+1234567" }).success).toBe(
			false,
		);
	});

	test("accepts the server's longest shape: a leading digit plus 14 more", () => {
		expect(
			phoneNumberSchema.safeParse({ phone: "+123456789012345" }).success,
		).toBe(true);
	});

	test("rejects a leading digit plus 15 more, one over the server's ceiling", () => {
		expect(
			phoneNumberSchema.safeParse({ phone: "+1234567890123456" }).success,
		).toBe(false);
	});
});
