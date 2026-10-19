// @vitest-environment node
import { type Payload, UnverifiedEmail } from "payload";
import { describe, expect, it, vi } from "vitest";
import { Users } from "../../src/collections/Users";
import { emailAdapter, emailProvider } from "../../src/lib/email";
import {
	verificationEmailHtml,
	verificationEmailSubject,
} from "../../src/lib/verificationEmail";
import {
	RESEND_COOLDOWN_MS,
	resendVerificationEmail,
} from "../../src/services/emailVerification";

const NOW = new Date("2026-10-19T10:00:00.000Z");

function payloadWith(user: Record<string, unknown> | null) {
	const updateOne = vi.fn(async () => undefined);
	const sendEmail = vi.fn(async () => undefined);
	const payload = {
		find: vi.fn(async () => ({ docs: user ? [user] : [] })),
		db: { updateOne },
		sendEmail,
	} as unknown as Payload;
	return { payload, updateOne, sendEmail };
}

const waiting = {
	id: "u-1",
	email: "awa@example.com",
	name: "Awa",
	language: "en",
	_verified: false,
	emailVerificationSentAt: new Date(
		NOW.getTime() - RESEND_COOLDOWN_MS - 1,
	).toISOString(),
};

describe("signing in waits for a verified email", () => {
	it("is Payload's own verification, with our email", () => {
		expect(Users.auth).toMatchObject({ verify: expect.any(Object) });
	});

	it("answers an unverified sign-in with a code the apps act on", async () => {
		const hook = Users.hooks?.afterError?.[0];
		const result = await hook?.({
			error: new UnverifiedEmail({}),
		} as never);
		expect(result).toMatchObject({
			status: 403,
			response: { errors: [{ data: { code: "auth.emailNotVerified" } }] },
		});
	});
});

describe("the verification email", () => {
	it("is written in the account's language and links to the web page", () => {
		expect(verificationEmailSubject({ language: "en" })).toBe(
			"Confirm your email address",
		);
		expect(verificationEmailSubject({ language: null })).toBe(
			"Confirmez votre adresse e-mail",
		);
		const html = verificationEmailHtml({ name: "Awa", language: "fr" }, "t0k");
		expect(html).toContain("/auth/verify-email?token=t0k");
		expect(html).toContain("Bonjour Awa");
	});

	it("never lets a name inject markup", () => {
		expect(
			verificationEmailHtml({ name: "<b>x</b>", language: "en" }, "t"),
		).not.toContain("<b>x</b>");
	});
});

describe("resending the verification email", () => {
	it("sends a fresh link to an account still waiting", async () => {
		const { payload, updateOne, sendEmail } = payloadWith(waiting);
		expect(
			await resendVerificationEmail(payload, " Awa@Example.com ", NOW),
		).toBe("sent");
		const update = updateOne.mock.calls[0] as unknown as [
			{ data: { _verificationToken: string } },
		];
		expect(update[0].data._verificationToken).toMatch(/^[a-f0-9]{40}$/);
		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "awa@example.com",
				subject: "Confirm your email address",
			}),
		);
	});

	it("waits a minute between two emails", async () => {
		const { payload, sendEmail } = payloadWith({
			...waiting,
			emailVerificationSentAt: new Date(NOW.getTime() - 5_000).toISOString(),
		});
		expect(await resendVerificationEmail(payload, waiting.email, NOW)).toBe(
			"cooldown",
		);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("sends nothing to a verified account, an older one, or no account", async () => {
		for (const user of [
			{ ...waiting, _verified: true },
			{ ...waiting, _verified: undefined },
			null,
		]) {
			const { payload, sendEmail } = payloadWith(user);
			expect(await resendVerificationEmail(payload, waiting.email, NOW)).toBe(
				"nothing",
			);
			expect(sendEmail).not.toHaveBeenCalled();
		}
	});
});

describe("which service sends the email", () => {
	it("is the one named, else whichever key is set, else the log", () => {
		expect(emailProvider({ EMAIL_PROVIDER: "smtp", RESEND_API_KEY: "k" })).toBe(
			"smtp",
		);
		expect(emailProvider({ RESEND_API_KEY: "re_x" })).toBe("resend");
		expect(emailProvider({ SMTP_HOST: "smtp.example.com" })).toBe("smtp");
		expect(emailProvider({})).toBeNull();
		expect(emailAdapter({})).toBeUndefined();
	});

	it("refuses a provider named without its key", () => {
		expect(() => emailAdapter({ EMAIL_PROVIDER: "resend" })).toThrow(
			/RESEND_API_KEY/,
		);
	});
});
