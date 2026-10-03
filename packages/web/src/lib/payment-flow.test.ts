import { describe, expect, test } from "bun:test";
import {
	ATTEMPT_IN_PROGRESS_MS,
	type AttemptFormState,
	attemptFormReducer,
	CHECKOUT_MAX_ATTEMPTS,
	canResend,
	codFallbackAllowed,
	failedActions,
	formatCountdown,
	freshAttempt,
	isPastDeadline,
	isTerminalStatus,
	payAttemptSchema,
	pollIntervalMs,
	resendWaitSeconds,
	secondsUntil,
	stepFor,
} from "./payment-flow";

describe("constants", () => {
	test("mirror the server's own attempt limit and cool-down", () => {
		expect(CHECKOUT_MAX_ATTEMPTS).toBe(3);
		expect(ATTEMPT_IN_PROGRESS_MS).toBe(180_000);
	});
});

describe("isTerminalStatus", () => {
	test("created and pending are open", () => {
		expect(isTerminalStatus("created")).toBe(false);
		expect(isTerminalStatus("pending")).toBe(false);
	});
	test("succeeded, failed, cancelled and expired are terminal", () => {
		expect(isTerminalStatus("succeeded")).toBe(true);
		expect(isTerminalStatus("failed")).toBe(true);
		expect(isTerminalStatus("cancelled")).toBe(true);
		expect(isTerminalStatus("expired")).toBe(true);
	});
});

describe("pollIntervalMs", () => {
	test("3 s for the first 60 s of polling", () => {
		expect(pollIntervalMs(0)).toBe(3_000);
		expect(pollIntervalMs(59_999)).toBe(3_000);
	});
	test("10 s from 60 s onward", () => {
		expect(pollIntervalMs(60_000)).toBe(10_000);
		expect(pollIntervalMs(600_000)).toBe(10_000);
	});
});

describe("secondsUntil", () => {
	test("counts down to the deadline", () => {
		const now = Date.parse("2026-10-03T12:00:00.000Z");
		expect(secondsUntil("2026-10-03T12:00:05.000Z", now)).toBe(5);
		expect(secondsUntil("2026-10-03T12:01:00.000Z", now)).toBe(60);
	});
	test("floors at 0 once the deadline has passed", () => {
		const now = Date.parse("2026-10-03T12:00:00.000Z");
		expect(secondsUntil("2026-10-03T11:59:00.000Z", now)).toBe(0);
		expect(secondsUntil("2026-10-03T12:00:00.000Z", now)).toBe(0);
	});
	test("an unparsable deadline reads as 0, not NaN", () => {
		expect(secondsUntil("not-a-date", 0)).toBe(0);
	});
});

describe("isPastDeadline", () => {
	test("true at and after the deadline, false before it", () => {
		const deadline = "2026-10-03T12:00:00.000Z";
		const at = Date.parse(deadline);
		expect(isPastDeadline(deadline, at - 1)).toBe(false);
		expect(isPastDeadline(deadline, at)).toBe(true);
		expect(isPastDeadline(deadline, at + 1)).toBe(true);
	});
	test("a missing deadline reads as already past", () => {
		expect(isPastDeadline("", 0)).toBe(true);
	});
});

describe("formatCountdown", () => {
	test("pins exact mm:ss text", () => {
		expect(formatCountdown(0)).toBe("0:00");
		expect(formatCountdown(5)).toBe("0:05");
		expect(formatCountdown(65)).toBe("1:05");
		expect(formatCountdown(1_800)).toBe("30:00");
	});
	test("never renders a negative duration", () => {
		expect(formatCountdown(-5)).toBe("0:00");
	});
});

describe("resendWaitSeconds / canResend", () => {
	test("counts down the 3-minute cool-down", () => {
		const pendingSince = 1_000;
		expect(resendWaitSeconds(pendingSince, pendingSince)).toBe(180);
		expect(resendWaitSeconds(pendingSince, pendingSince + 179_000)).toBe(1);
		expect(canResend(pendingSince, pendingSince + 179_000)).toBe(false);
	});
	test("reaches zero, and only then, at the cool-down's end", () => {
		const pendingSince = 1_000;
		expect(resendWaitSeconds(pendingSince, pendingSince + 180_000)).toBe(0);
		expect(canResend(pendingSince, pendingSince + 180_000)).toBe(true);
		expect(canResend(pendingSince, pendingSince + 300_000)).toBe(true);
	});
});

describe("stepFor", () => {
	test("maps every status to exactly its screen step", () => {
		expect(stepFor("created")).toBe("pending");
		expect(stepFor("pending")).toBe("pending");
		expect(stepFor("succeeded")).toBe("paid");
		expect(stepFor("failed")).toBe("failed");
		expect(stepFor("cancelled")).toBe("expired");
		expect(stepFor("expired")).toBe("expired");
	});
});

describe("freshAttempt", () => {
	test("keeps the channel and phone, and swaps in the new key", () => {
		const previous = {
			channel: "cm.mtn" as const,
			phone: "+237670000000",
			idempotencyKey: "old-key",
		};
		expect(freshAttempt(previous, "new-key")).toEqual({
			channel: "cm.mtn",
			phone: "+237670000000",
			idempotencyKey: "new-key",
		});
	});

	/**
	 * Mutation check (see the task report): reusing `previous.idempotencyKey`
	 * instead of the fresh one is exactly the bug this pins — the object
	 * above is asserted whole, including the key, so a retry that silently
	 * replays the old attempt fails this test rather than passing it.
	 */
	test("the new key differs from the one it replaces", () => {
		const previous = {
			channel: "cm.orange" as const,
			phone: "+237690000000",
			idempotencyKey: "old-key",
		};
		const next = freshAttempt(previous, "new-key");
		expect(next.idempotencyKey).toBe("new-key");
		expect(next.idempotencyKey).not.toBe(previous.idempotencyKey);
	});
});

describe("attemptFormReducer", () => {
	const initial: AttemptFormState = { channel: null, phone: "" };

	test("channelChosen sets the channel", () => {
		expect(
			attemptFormReducer(initial, { type: "channelChosen", channel: "cm.mtn" }),
		).toEqual({ channel: "cm.mtn", phone: "" });
	});

	test("phoneChanged sets the phone and leaves the channel", () => {
		const withChannel: AttemptFormState = { channel: "cm.orange", phone: "" };
		expect(
			attemptFormReducer(withChannel, {
				type: "phoneChanged",
				phone: "+237690000000",
			}),
		).toEqual({ channel: "cm.orange", phone: "+237690000000" });
	});

	test("operatorReset forgets the channel and keeps the phone", () => {
		const chosen: AttemptFormState = {
			channel: "cm.mtn",
			phone: "+237670000000",
		};
		expect(attemptFormReducer(chosen, { type: "operatorReset" })).toEqual({
			channel: null,
			phone: "+237670000000",
		});
	});
});

describe("payAttemptSchema", () => {
	test("accepts a known channel and a Cameroonian mobile number", () => {
		const result = payAttemptSchema.safeParse({
			channel: "cm.mtn",
			phone: "+237670000000",
		});
		expect(result.success).toBe(true);
	});
	test("refuses an unknown channel", () => {
		expect(
			payAttemptSchema.safeParse({
				channel: "cm.vodafone",
				phone: "+237670000000",
			}).success,
		).toBe(false);
	});
	test("refuses a phone outside the Cameroonian mobile shape", () => {
		expect(
			payAttemptSchema.safeParse({ channel: "cm.mtn", phone: "0670000000" })
				.success,
		).toBe(false);
	});
});

describe("codFallbackAllowed", () => {
	test("offered on shopNotEligible when the order allows COD", () => {
		expect(codFallbackAllowed("payment.shopNotEligible", true)).toBe(true);
	});
	test("offered on tooManyAttempts when the order allows COD", () => {
		expect(codFallbackAllowed("payment.tooManyAttempts", true)).toBe(true);
	});
	test("never offered when the order does not allow COD", () => {
		expect(codFallbackAllowed("payment.shopNotEligible", false)).toBe(false);
	});
	test("not offered for a per-attempt failure such as a decline", () => {
		expect(codFallbackAllowed("payment.declined", true)).toBe(false);
	});
});

describe("failedActions", () => {
	test("offers retry and a different operator while attempts remain", () => {
		expect(failedActions(2, false)).toEqual(["retry", "changeOperator"]);
	});
	test("adds the COD fallback after the retry actions when allowed", () => {
		expect(failedActions(1, true)).toEqual([
			"retry",
			"changeOperator",
			"payOnDelivery",
		]);
	});
	test("drops retry and change-operator once attempts are spent", () => {
		expect(failedActions(0, false)).toEqual([]);
	});
	test("a spent order still offers the COD fallback alone, when allowed", () => {
		expect(failedActions(0, true)).toEqual(["payOnDelivery"]);
	});
});
