// @vitest-environment node
import { afterEach, describe, expect, it, type vi } from "vitest";
import { startPhoneVerification } from "../../src/services/phoneVerification";
import { fakePayload } from "./helpers/fakePayload";

const PHONE = "+237612345678";

function user() {
	return {
		id: "u-1",
		email: "seller@example.com",
		phone: null,
		pendingPhone: null,
		phoneVerificationAttempts: 0,
		phoneVerificationCodeHash: null,
		phoneVerificationExpiresAt: null,
		phoneVerificationLastSentAt: null,
		phoneVerifiedAt: null,
	} as Parameters<typeof startPhoneVerification>[1];
}

function world() {
	return fakePayload({ users: [user()] });
}

const ORIGINAL_DEV_LOG = process.env.PHONE_OTP_DEV_LOG;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function restoreEnv() {
	if (ORIGINAL_DEV_LOG === undefined) {
		Reflect.deleteProperty(process.env, "PHONE_OTP_DEV_LOG");
	} else {
		process.env.PHONE_OTP_DEV_LOG = ORIGINAL_DEV_LOG;
	}
	if (ORIGINAL_NODE_ENV === undefined) {
		Reflect.deleteProperty(process.env, "NODE_ENV");
	} else {
		process.env.NODE_ENV = ORIGINAL_NODE_ENV;
	}
}

describe("startPhoneVerification / PHONE_OTP_DEV_LOG", () => {
	afterEach(() => {
		restoreEnv();
	});

	it("logs the OTP and still succeeds when the switch is on, even with no SMS provider configured", async () => {
		process.env.PHONE_OTP_DEV_LOG = "true";
		process.env.NODE_ENV = "development";
		const payload = world();

		const status = await startPhoneVerification(payload, user(), PHONE);

		expect(status.pendingPhone).toBe(PHONE);
		const logInfo = payload.logger.info as unknown as ReturnType<typeof vi.fn>;
		expect(logInfo).toHaveBeenCalledTimes(1);
		const [message] = logInfo.mock.calls[0];
		expect(String(message)).toContain(PHONE);
		expect(String(message)).toContain("PHONE_OTP_DEV_LOG");
	});

	it("logs nothing and start still fails with no SMS provider when the switch is off", async () => {
		Reflect.deleteProperty(process.env, "PHONE_OTP_DEV_LOG");
		process.env.NODE_ENV = "development";
		const payload = world();

		await expect(
			startPhoneVerification(payload, user(), PHONE),
		).rejects.toThrow("SMS provider is not configured");
		expect(payload.logger.info).not.toHaveBeenCalled();
	});

	it("logs nothing, and start still fails with no SMS provider, when NODE_ENV is production even with the switch on", async () => {
		process.env.PHONE_OTP_DEV_LOG = "true";
		process.env.NODE_ENV = "production";
		const payload = world();

		await expect(
			startPhoneVerification(payload, user(), PHONE),
		).rejects.toThrow("SMS provider is not configured");
		expect(payload.logger.info).not.toHaveBeenCalled();
	});
});
