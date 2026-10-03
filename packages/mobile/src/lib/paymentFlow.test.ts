import { describe, expect, test } from "bun:test";
import { ERROR_CODES } from "./apiError";
import {
	canResend,
	codFallbackOffered,
	FOREGROUND_REFRESH_MIN_INTERVAL_MS,
	formatCountdown,
	isPastExpiry,
	NOTIFICATION_LEAD_MS,
	pendingPhaseOf,
	pendingReturnDeepLink,
	RESEND_COOLDOWN_MS,
	reminderFireAt,
	resendSecondsLeft,
	secondsUntil,
	shouldRefetchOnForeground,
	withAppReturnSignal,
} from "./paymentFlow";

describe("countdown", () => {
	test("counts down to the second, never negative", () => {
		const now = new Date("2026-10-03T10:00:00Z");
		expect(
			secondsUntil(new Date(now.getTime() + 125_000).toISOString(), now),
		).toBe(125);
		expect(
			secondsUntil(new Date(now.getTime() - 5_000).toISOString(), now),
		).toBe(0);
	});

	test("formats minutes:seconds without padding the minutes", () => {
		expect(formatCountdown(65)).toBe("1:05");
		expect(formatCountdown(599)).toBe("9:59");
		expect(formatCountdown(0)).toBe("0:00");
	});

	test("past expiry is past, exactly at expiry is past", () => {
		const now = new Date("2026-10-03T10:00:00Z");
		expect(isPastExpiry(now.toISOString(), now)).toBe(true);
		expect(isPastExpiry(new Date(now.getTime() + 1).toISOString(), now)).toBe(
			false,
		);
	});
});

describe("AppState foreground re-check", () => {
	test("refetches once the minimum interval has elapsed", () => {
		expect(
			shouldRefetchOnForeground(0, FOREGROUND_REFRESH_MIN_INTERVAL_MS),
		).toBe(true);
	});

	test("does not refetch before the minimum interval", () => {
		expect(
			shouldRefetchOnForeground(0, FOREGROUND_REFRESH_MIN_INTERVAL_MS - 1),
		).toBe(false);
	});

	test("a second foreground event right after the first is suppressed", () => {
		let lastCheckedAt = 0;
		expect(shouldRefetchOnForeground(lastCheckedAt, 10_000)).toBe(true);
		lastCheckedAt = 10_000;
		expect(shouldRefetchOnForeground(lastCheckedAt, 10_500)).toBe(false);
	});
});

describe("expiry reminder notification", () => {
	test("fires one minute before expiry while the attempt is open", () => {
		const expiresAt = "2026-10-03T10:30:00Z";
		const now = new Date("2026-10-03T10:00:00Z");
		expect(reminderFireAt(expiresAt, "pending", now)).toBe(
			Date.parse(expiresAt) - NOTIFICATION_LEAD_MS,
		);
		expect(reminderFireAt(expiresAt, "created", now)).not.toBeNull();
	});

	test("never fires once the attempt is no longer open", () => {
		const expiresAt = "2026-10-03T10:30:00Z";
		const now = new Date("2026-10-03T10:00:00Z");
		for (const status of [
			"succeeded",
			"failed",
			"cancelled",
			"expired",
		] as const) {
			expect(reminderFireAt(expiresAt, status, now)).toBeNull();
		}
	});

	test("does not fire in the past, once less than a lead's worth is left", () => {
		const now = new Date("2026-10-03T10:29:59.500Z");
		expect(reminderFireAt("2026-10-03T10:30:00Z", "pending", now)).toBeNull();
	});
});

describe("resend cooldown", () => {
	test("blocks a resend for three minutes", () => {
		const lastAttemptAt = new Date("2026-10-03T10:00:00Z");
		const now = new Date(lastAttemptAt.getTime() + 60_000);
		expect(canResend(lastAttemptAt, now)).toBe(false);
		expect(resendSecondsLeft(lastAttemptAt, now)).toBe(
			RESEND_COOLDOWN_MS / 1000 - 60,
		);
	});

	test("allows a resend once the cooldown has fully elapsed", () => {
		const lastAttemptAt = new Date("2026-10-03T10:00:00Z");
		const now = new Date(lastAttemptAt.getTime() + RESEND_COOLDOWN_MS);
		expect(canResend(lastAttemptAt, now)).toBe(true);
		expect(resendSecondsLeft(lastAttemptAt, now)).toBe(0);
	});
});

describe("pending screen phase", () => {
	const now = new Date("2026-10-03T10:00:00Z");
	const future = new Date(now.getTime() + 60_000).toISOString();
	const past = new Date(now.getTime() - 60_000).toISOString();

	test("the order already paid wins over whatever the intent says", () => {
		expect(
			pendingPhaseOf(
				{
					orderPaymentStatus: "paid",
					intent: { status: "pending", expiresAt: future },
				},
				now,
			),
		).toBe("succeeded");
	});

	test("no intent and an unpaid order reads as cancelled", () => {
		expect(
			pendingPhaseOf({ orderPaymentStatus: "unpaid", intent: null }, now),
		).toBe("cancelled");
	});

	test("no intent yet but the order is mid-attempt reads as checking", () => {
		expect(
			pendingPhaseOf(
				{ orderPaymentStatus: "awaiting_payment", intent: null },
				now,
			),
		).toBe("checking");
	});

	test("an open intent still inside its window is pending", () => {
		expect(
			pendingPhaseOf(
				{
					orderPaymentStatus: "awaiting_payment",
					intent: { status: "pending", expiresAt: future },
				},
				now,
			),
		).toBe("pending");
	});

	test("an open intent whose own expiry has passed is checking, not expired", () => {
		expect(
			pendingPhaseOf(
				{
					orderPaymentStatus: "awaiting_payment",
					intent: { status: "created", expiresAt: past },
				},
				now,
			),
		).toBe("checking");
	});

	test("every terminal intent status maps straight through", () => {
		for (const status of [
			"succeeded",
			"failed",
			"expired",
			"cancelled",
		] as const) {
			expect(
				pendingPhaseOf(
					{
						orderPaymentStatus: "awaiting_payment",
						intent: { status, expiresAt: past },
					},
					now,
				),
			).toBe(status === "succeeded" ? "succeeded" : status);
		}
	});
});

describe("COD fallback on shopNotEligible", () => {
	test("offered only on that exact code, and only when COD is still allowed", () => {
		expect(codFallbackOffered(ERROR_CODES.paymentShopNotEligible, true)).toBe(
			true,
		);
		expect(codFallbackOffered(ERROR_CODES.paymentShopNotEligible, false)).toBe(
			false,
		);
	});

	test("never offered for an unrelated error", () => {
		expect(codFallbackOffered(ERROR_CODES.paymentOrderNotPayable, true)).toBe(
			false,
		);
		expect(codFallbackOffered(null, true)).toBe(false);
	});
});

describe("hosted-checkout return idiom", () => {
	test("the return deep link is the pending screen, nothing else", () => {
		expect(pendingReturnDeepLink("ord_123")).toBe(
			"buynsellem://checkout/ord_123/pending",
		);
	});

	test("appends appReturnUrl without disturbing the provider's own params", () => {
		const opened = withAppReturnSignal(
			"https://pay.example.com/checkout/abc?reference=xyz",
			"ord_123",
		);
		const url = new URL(opened);
		expect(url.searchParams.get("reference")).toBe("xyz");
		expect(url.searchParams.get("appReturnUrl")).toBe(
			"buynsellem://checkout/ord_123/pending",
		);
	});
});
