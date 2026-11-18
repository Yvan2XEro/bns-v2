// @vitest-environment node
import { describe, expect, it, type vi } from "vitest";
import { startPhoneVerification } from "../../src/services/phoneVerification";
import { sendSms } from "../../src/services/smsProvider";
import { fakePayload } from "./helpers/fakePayload";

const PHONE = "+237612345678";
const MESSAGE = { message: "hello", to: PHONE };

function logInfo(payload: ReturnType<typeof fakePayload>) {
	return payload.logger.info as unknown as ReturnType<typeof vi.fn>;
}

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

describe("sendSms", () => {
	it("throws when no provider is configured", async () => {
		const payload = fakePayload({}, { globals: { "app-settings": {} } });
		await expect(sendSms(payload, MESSAGE)).rejects.toThrow(
			"SMS provider is not configured",
		);
	});

	it("still routes to avlytext when selected, unaffected by the console option", async () => {
		const payload = fakePayload(
			{},
			{ globals: { "app-settings": { sms: { provider: "avlytext" } } } },
		);
		// No apiKey configured: reaches avlytextProvider, which is the same
		// failure it produced before the console provider existed.
		await expect(sendSms(payload, MESSAGE)).rejects.toThrow(
			"AvlyText API key is missing",
		);
	});

	it("still routes to mtarget when selected, unaffected by the console option", async () => {
		const payload = fakePayload(
			{},
			{ globals: { "app-settings": { sms: { provider: "mtarget" } } } },
		);
		await expect(sendSms(payload, MESSAGE)).rejects.toThrow(
			"MTarget API key is missing",
		);
	});

	it("logs through the Payload logger when the console provider is selected, with no credentials needed", async () => {
		const payload = fakePayload(
			{},
			{ globals: { "app-settings": { sms: { provider: "console" } } } },
		);

		await expect(sendSms(payload, MESSAGE)).resolves.toMatchObject({
			provider: "console",
			to: PHONE,
		});
		expect(logInfo(payload)).toHaveBeenCalledTimes(1);
		const [logged] = logInfo(payload).mock.calls[0];
		expect(String(logged)).toContain(PHONE);
		expect(String(logged)).toContain(MESSAGE.message);
	});
});

describe("startPhoneVerification with the console SMS provider", () => {
	it("succeeds with no SMS credentials configured and puts the code where the logger can be read", async () => {
		const payload = fakePayload(
			{ users: [user()] },
			{ globals: { "app-settings": { sms: { provider: "console" } } } },
		);

		const status = await startPhoneVerification(payload, user(), PHONE);

		expect(status.pendingPhone).toBe(PHONE);
		expect(logInfo(payload)).toHaveBeenCalledTimes(1);
		expect(String(logInfo(payload).mock.calls[0][0])).toContain(PHONE);
	});

	it("still fails when no provider is configured at all", async () => {
		const payload = fakePayload(
			{ users: [user()] },
			{ globals: { "app-settings": {} } },
		);

		await expect(
			startPhoneVerification(payload, user(), PHONE),
		).rejects.toThrow("SMS provider is not configured");
		expect(logInfo(payload)).not.toHaveBeenCalled();
	});
});
