import { describe, expect, it } from "vitest";
import { ShopInvitations } from "../../src/collections/ShopInvitations";
import {
	maskEmail,
	maskPhone,
	maskTarget,
	normalizeInvitationTarget,
	pendingKeyFor,
} from "../../src/lib/invitationTargets";
import {
	createInvitationToken,
	hashInvitationToken,
	INVITATION_TOKEN_BYTES,
	invitationExpiresAt,
	isInvitationUsable,
} from "../../src/lib/invitationTokens";

describe("normalizeInvitationTarget", () => {
	it("normalises a Cameroonian number written with spaces to E.164", () => {
		expect(normalizeInvitationTarget("phone", " +237 6 12 34 54 21 ")).toBe(
			"+237612345421",
		);
	});

	it("refuses a phone number with no country code", () => {
		expect(() => normalizeInvitationTarget("phone", "612345421")).toThrow(
			expect.objectContaining({ code: "phone.invalid" }),
		);
	});

	it("lowercases and trims an email", () => {
		expect(normalizeInvitationTarget("email", "  Alice@Gmail.COM ")).toBe(
			"alice@gmail.com",
		);
	});

	it("refuses something that is not an email", () => {
		expect(() => normalizeInvitationTarget("email", "alice@")).toThrow(
			expect.objectContaining({ code: "auth.invalidEmail" }),
		);
	});

	it("refuses a non-string", () => {
		expect(() => normalizeInvitationTarget("email", 42)).toThrow(
			expect.objectContaining({ code: "auth.invalidEmail" }),
		);
	});
});

describe("masking", () => {
	it("masks a phone number the way the spec writes it", () => {
		expect(maskPhone("+237612345421")).toBe("+237 6•• •• •4 21");
	});

	it("masks a shorter national part without crashing", () => {
		expect(maskPhone("+3312345678")).toBe("+33 1••••8");
	});

	it("masks an email to its first letter", () => {
		expect(maskEmail("alice@gmail.com")).toBe("a•••@gmail.com");
	});

	it("masks a one-letter local part entirely", () => {
		expect(maskEmail("a@gmail.com")).toBe("•••@gmail.com");
	});

	it("dispatches on the channel", () => {
		expect(maskTarget("phone", "+237612345421")).toBe(
			maskPhone("+237612345421"),
		);
		expect(maskTarget("email", "alice@gmail.com")).toBe(
			maskEmail("alice@gmail.com"),
		);
	});
});

describe("pendingKeyFor", () => {
	it("joins the shop, the channel and the normalised target", () => {
		expect(pendingKeyFor("s-1", "phone", "+237612345421")).toBe(
			"s-1:phone:+237612345421",
		);
		expect(pendingKeyFor("s-1", "email", "alice@gmail.com")).toBe(
			"s-1:email:alice@gmail.com",
		);
	});
});

describe("createInvitationToken", () => {
	it("returns a base64url token of 32 random bytes and its sha256", () => {
		const { token, tokenHash } = createInvitationToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(Buffer.from(token, "base64url")).toHaveLength(
			INVITATION_TOKEN_BYTES,
		);
		expect(tokenHash).toBe(hashInvitationToken(token));
		expect(tokenHash).toHaveLength(64);
	});

	it("never repeats a token", () => {
		const tokens = new Set(
			Array.from({ length: 50 }, () => createInvitationToken().token),
		);
		expect(tokens.size).toBe(50);
	});

	it("never stores the raw token: the hash is not the token, and a resend's new hash replaces the old one", () => {
		const first = createInvitationToken();
		const resend = createInvitationToken();
		expect(first.tokenHash).not.toBe(first.token);
		// A document that replaced tokenHash on resend no longer matches the
		// old raw token's hash, which is what makes the previous link dead.
		expect(hashInvitationToken(first.token)).not.toBe(resend.tokenHash);
		expect(hashInvitationToken(resend.token)).toBe(resend.tokenHash);
	});
});

describe("invitationExpiresAt", () => {
	it("is seven days after the given instant", () => {
		expect(invitationExpiresAt(new Date("2026-10-01T09:30:00.000Z"))).toBe(
			"2026-10-08T09:30:00.000Z",
		);
	});
});

describe("isInvitationUsable", () => {
	const now = new Date("2026-10-05T00:00:00.000Z");

	it("accepts a pending invitation that has not expired", () => {
		expect(
			isInvitationUsable(
				{ status: "pending", expiresAt: "2026-10-08T00:00:00.000Z" },
				now,
			),
		).toBe(true);
	});

	it("treats a pending invitation past its expiry as unusable at read time", () => {
		expect(
			isInvitationUsable(
				{ status: "pending", expiresAt: "2026-10-04T23:59:59.000Z" },
				now,
			),
		).toBe(false);
	});

	it("rejects every non-pending status", () => {
		for (const status of ["accepted", "declined", "revoked", "expired"]) {
			expect(
				isInvitationUsable(
					{ status, expiresAt: "2026-10-08T00:00:00.000Z" },
					now,
				),
			).toBe(false);
		}
	});

	it("rejects a pending invitation with no expiry at all", () => {
		expect(
			isInvitationUsable({ status: "pending", expiresAt: null }, now),
		).toBe(false);
	});
});

describe("the collection", () => {
	it("closes create, update and delete to every request", () => {
		const admin = { req: { user: { id: "u-admin", role: "admin" } } } as never;
		expect(ShopInvitations.access?.create?.(admin)).toBe(false);
		expect(ShopInvitations.access?.update?.(admin)).toBe(false);
		expect(ShopInvitations.access?.delete?.(admin)).toBe(false);
	});

	it("never exposes tokenHash", () => {
		const field = (
			ShopInvitations.fields as Array<{
				name?: string;
				access?: { read?: () => boolean };
			}>
		).find((f) => f.name === "tokenHash");
		expect(field?.access?.read?.()).toBe(false);
	});

	it("has no field for the raw token, only its hash", () => {
		const names = (ShopInvitations.fields as Array<{ name?: string }>).map(
			(f) => f.name,
		);
		expect(names).toContain("tokenHash");
		expect(names).not.toContain("token");
	});

	it("requires phone for a phone invitation and email for an email one", () => {
		const fields = ShopInvitations.fields as Array<{
			name?: string;
			validate?: (
				value: unknown,
				args: { siblingData: Record<string, unknown> },
			) => true | string;
		}>;
		const phone = fields.find((f) => f.name === "phone");
		const email = fields.find((f) => f.name === "email");
		expect(
			phone?.validate?.(undefined, { siblingData: { channel: "phone" } }),
		).toBeTypeOf("string");
		expect(
			phone?.validate?.("+237612345421", { siblingData: { channel: "phone" } }),
		).toBe(true);
		expect(
			phone?.validate?.(undefined, { siblingData: { channel: "email" } }),
		).toBe(true);
		expect(
			email?.validate?.(undefined, { siblingData: { channel: "email" } }),
		).toBeTypeOf("string");
		expect(
			email?.validate?.("alice@gmail.com", {
				siblingData: { channel: "email" },
			}),
		).toBe(true);
	});
});
