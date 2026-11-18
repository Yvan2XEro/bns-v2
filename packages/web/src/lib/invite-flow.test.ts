import { describe, expect, test } from "bun:test";
import type { PublicInvitationView } from "~/types";
import { accountHint, inviteStep } from "./invite-flow";

const invitation = (
	over: Partial<PublicInvitationView> = {},
): PublicInvitationView => ({
	shop: { name: "Akwa", handle: "akwa", logoUrl: null, badge: "identity" },
	role: "staff",
	channel: "email",
	maskedTarget: "b•••@example.com",
	inviterFirstName: "Aicha",
	expiresAt: "2026-10-08T00:00:00.000Z",
	status: "pending",
	...over,
});

const viewer = (
	over: Partial<{
		email: string | null;
		phone: string | null;
		phoneVerifiedAt: string | null;
	}> = {},
) => ({
	email: "bruno@example.com",
	phone: null,
	phoneVerifiedAt: null,
	...over,
});

describe("inviteStep", () => {
	test("loading while there is neither an invitation nor an error", () => {
		expect(
			inviteStep({
				invitation: null,
				error: null,
				viewer: null,
				joined: false,
			}),
		).toBe("loading");
	});

	test("invalid on an unknown token", () => {
		expect(
			inviteStep({
				invitation: null,
				error: "team.invitationInvalid",
				viewer: null,
				joined: false,
			}),
		).toBe("invalid");
	});

	test("expired and responded read differently, because the answer differs", () => {
		expect(
			inviteStep({
				invitation: invitation({ status: "expired" }),
				error: null,
				viewer: viewer(),
				joined: false,
			}),
		).toBe("expired");
		for (const status of ["accepted", "declined", "revoked"] as const) {
			expect(
				inviteStep({
					invitation: invitation({ status }),
					error: null,
					viewer: viewer(),
					joined: false,
				}),
			).toBe("responded");
		}
	});

	test("asks a signed-out visitor to sign in", () => {
		expect(
			inviteStep({
				invitation: invitation(),
				error: null,
				viewer: null,
				joined: false,
			}),
		).toBe("signIn");
	});

	test("is ready when the signed-in address is on the invited domain, case-insensitively", () => {
		expect(
			inviteStep({
				invitation: invitation(),
				error: null,
				viewer: viewer({ email: "Bruno@Example.com" }),
				joined: false,
			}),
		).toBe("ready");
	});

	test("is a mismatch when the signed-in address is on another domain", () => {
		expect(
			inviteStep({
				invitation: invitation(),
				error: null,
				viewer: viewer({ email: "other@gmail.com" }),
				joined: false,
			}),
		).toBe("mismatch");
	});

	test("cannot tell two accounts on the same domain apart, and lets the server decide", () => {
		// The local part is masked on purpose, so the page offers the action and
		// `team.invitationMismatch` from the accept is what corrects it.
		expect(
			inviteStep({
				invitation: invitation(),
				error: null,
				viewer: viewer({ email: "someone@example.com" }),
				joined: false,
			}),
		).toBe("ready");
	});

	test("asks for phone verification on a phone invitation with no verified number", () => {
		expect(
			inviteStep({
				invitation: invitation({
					channel: "phone",
					maskedTarget: "+237 6•• •• •4 21",
				}),
				error: null,
				viewer: viewer({ phone: null, phoneVerifiedAt: null }),
				joined: false,
			}),
		).toBe("verifyPhone");
	});

	test("is ready on a phone invitation once a number is verified: the server decides the match", () => {
		expect(
			inviteStep({
				invitation: invitation({ channel: "phone" }),
				error: null,
				viewer: viewer({
					phone: "+237612345421",
					phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
				}),
				joined: false,
			}),
		).toBe("ready");
	});

	test("shows the mismatch the server reported", () => {
		expect(
			inviteStep({
				invitation: invitation({ channel: "phone" }),
				error: "team.invitationMismatch",
				viewer: viewer({
					phone: "+237699999999",
					phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
				}),
				joined: false,
			}),
		).toBe("mismatch");
	});

	test("joined wins over everything once the accept has landed", () => {
		expect(
			inviteStep({
				invitation: invitation({ status: "accepted" }),
				error: null,
				viewer: viewer(),
				joined: true,
			}),
		).toBe("joined");
	});
});

describe("accountHint", () => {
	test("hands the copy the channel and the masked target, and nothing more", () => {
		expect(accountHint(invitation())).toEqual({
			channel: "email",
			maskedTarget: "b•••@example.com",
		});
		expect(
			accountHint(
				invitation({
					channel: "phone",
					maskedTarget: "+237 6•• •• •4 21",
				}),
			),
		).toEqual({
			channel: "phone",
			maskedTarget: "+237 6•• •• •4 21",
		});
	});
});
