// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	CONFIRMATION_MAX_ATTEMPTS,
	CONFIRMATION_MAX_RESENDS,
	CONFIRMATION_RESEND_COOLDOWN_MS,
	canRegenerate,
	canResend,
	checkConfirmation,
	checkHandover,
	codesMatch,
	generateCode,
	HANDOVER_MAX_ATTEMPTS,
	HANDOVER_MAX_REGENERATIONS,
	hashConfirmationCode,
	hashHandoverCode,
} from "../../src/lib/orderCodes";
import { hashDeliveryPhone, requirePhonePepper } from "../../src/lib/phoneHash";

const SECRET = "test-secret";
const now = new Date("2026-10-02T12:00:00.000Z");

describe("generateCode", () => {
	it("gives the asked-for number of digits, zero-padded", () => {
		for (let i = 0; i < 200; i++) {
			expect(generateCode(4)).toMatch(/^\d{4}$/);
			expect(generateCode(6)).toMatch(/^\d{6}$/);
		}
	});
});

describe("hashing", () => {
	it("binds a confirmation code to the order AND the phone", () => {
		const a = hashConfirmationCode(SECRET, "o-1", "+237600000001", "123456");
		expect(a).toBe(
			hashConfirmationCode(SECRET, "o-1", "+237600000001", "123456"),
		);
		expect(a).not.toBe(
			hashConfirmationCode(SECRET, "o-2", "+237600000001", "123456"),
		);
		expect(a).not.toBe(
			hashConfirmationCode(SECRET, "o-1", "+237600000002", "123456"),
		);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
	});

	it("binds a handover code to the order", () => {
		expect(hashHandoverCode(SECRET, "o-1", "4242")).not.toBe(
			hashHandoverCode(SECRET, "o-2", "4242"),
		);
	});

	it("never returns the code itself", () => {
		expect(hashHandoverCode(SECRET, "o-1", "4242")).not.toContain("4242");
	});
});

describe("codesMatch", () => {
	it("compares equal-length hashes without leaking length through a throw", () => {
		const hash = hashHandoverCode(SECRET, "o-1", "4242");
		expect(codesMatch(hash, hash)).toBe(true);
		expect(codesMatch(hash, hashHandoverCode(SECRET, "o-1", "4243"))).toBe(
			false,
		);
		expect(codesMatch(null, hash)).toBe(false);
		expect(codesMatch(hash, "short")).toBe(false);
	});
});

describe("checkConfirmation", () => {
	const state = {
		codeHash: hashConfirmationCode(SECRET, "o-1", "+237600000001", "123456"),
		codeExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
		attempts: 0,
	};
	const right = hashConfirmationCode(SECRET, "o-1", "+237600000001", "123456");
	const wrong = hashConfirmationCode(SECRET, "o-1", "+237600000001", "000000");

	it("accepts the right code before the deadline", () => {
		expect(checkConfirmation(state, right, now)).toEqual({ ok: true });
	});

	it("reports expiry ahead of invalidity, so an expired right code is not 'incorrect'", () => {
		const expired = {
			...state,
			codeExpiresAt: new Date(now.getTime() - 1).toISOString(),
		};
		expect(checkConfirmation(expired, right, now)).toEqual({
			ok: false,
			reason: "expired",
		});
		expect(checkConfirmation(expired, wrong, now)).toEqual({
			ok: false,
			reason: "expired",
		});
	});

	it("refuses once the attempts are spent, even for the right code", () => {
		const spent = { ...state, attempts: CONFIRMATION_MAX_ATTEMPTS };
		expect(checkConfirmation(spent, right, now)).toEqual({
			ok: false,
			reason: "attempts",
		});
	});

	it("treats a missing hash as no code issued", () => {
		expect(
			checkConfirmation(
				{ codeHash: null, codeExpiresAt: null, attempts: 0 },
				right,
				now,
			),
		).toEqual({ ok: false, reason: "invalid" });
	});
});

describe("checkHandover", () => {
	const hash = hashHandoverCode(SECRET, "o-1", "4242");

	it("accepts the right code", () => {
		expect(
			checkHandover({ codeHash: hash, attempts: 0, lockedAt: null }, hash),
		).toEqual({
			ok: true,
		});
	});

	it("locks at the fifth wrong attempt and stays locked for the right code", () => {
		const atFive = {
			codeHash: hash,
			attempts: HANDOVER_MAX_ATTEMPTS,
			lockedAt: null,
		};
		expect(
			checkHandover(atFive, hashHandoverCode(SECRET, "o-1", "0000")),
		).toEqual({
			ok: false,
			reason: "locked",
		});
		expect(checkHandover(atFive, hash)).toEqual({
			ok: false,
			reason: "locked",
		});
	});

	it("stays locked once lockedAt is set, whatever the attempt count says", () => {
		expect(
			checkHandover(
				{ codeHash: hash, attempts: 0, lockedAt: now.toISOString() },
				hash,
			),
		).toEqual({ ok: false, reason: "locked" });
	});
});

describe("the resend and regenerate budgets", () => {
	it("holds the sender to one code a minute", () => {
		const sentAt = new Date(
			now.getTime() - CONFIRMATION_RESEND_COOLDOWN_MS + 1,
		).toISOString();
		expect(canResend({ sentAt, resendCount: 0 }, now)).toBe(false);
		const old = new Date(
			now.getTime() - CONFIRMATION_RESEND_COOLDOWN_MS,
		).toISOString();
		expect(canResend({ sentAt: old, resendCount: 0 }, now)).toBe(true);
	});

	it("stops at three resends and three regenerations", () => {
		expect(
			canResend({ sentAt: null, resendCount: CONFIRMATION_MAX_RESENDS }, now),
		).toBe(false);
		expect(
			canRegenerate({ regenerateCount: HANDOVER_MAX_REGENERATIONS - 1 }),
		).toBe(true);
		expect(canRegenerate({ regenerateCount: HANDOVER_MAX_REGENERATIONS })).toBe(
			false,
		);
	});

	it("bounds the guesses at twenty on ten thousand codes", () => {
		expect((HANDOVER_MAX_REGENERATIONS + 1) * HANDOVER_MAX_ATTEMPTS).toBe(20);
	});
});

describe("hashDeliveryPhone", () => {
	it("is a keyed hash, so the score file never holds a number", () => {
		const a = hashDeliveryPhone("pepper-a", "+237600000001");
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(a).not.toContain("237600000001");
		expect(a).toBe(hashDeliveryPhone("pepper-a", "+237600000001"));
		expect(a).not.toBe(hashDeliveryPhone("pepper-b", "+237600000001"));
	});

	it("refuses to run without a pepper rather than hashing with a default", () => {
		expect(() => requirePhonePepper({})).toThrow(/ORDER_PHONE_PEPPER/);
		expect(requirePhonePepper({ ORDER_PHONE_PEPPER: "x" })).toBe("x");
	});
});
