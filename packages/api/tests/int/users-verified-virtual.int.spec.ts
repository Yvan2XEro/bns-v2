import { describe, expect, it } from "vitest";
import { deriveVerified, Users } from "../../src/collections/Users";

type Hook = (args: { doc: Record<string, unknown> }) => Record<string, unknown>;

describe("users.verified virtual", () => {
	it("is true exactly when the account has a live identity verification", () => {
		expect(
			deriveVerified({ identityVerifiedAt: "2026-10-01T00:00:00.000Z" }),
		).toBe(true);
		expect(deriveVerified({ identityVerifiedAt: null })).toBe(false);
		expect(deriveVerified({})).toBe(false);
	});

	it("ignores a stored legacy tick", () => {
		expect(
			deriveVerified({
				verified: true,
				legacyVerifiedAt: "2026-01-01T00:00:00.000Z",
			}),
		).toBe(false);
	});

	it("is computed on every read, beside phoneVerified", () => {
		const beforeRead = (Users.hooks?.beforeRead ?? []) as Hook[];
		const doc = {
			phoneVerifiedAt: "2026-01-01",
			identityVerifiedAt: "2026-10-01",
			verified: false,
		};
		const result = beforeRead.reduce(
			(d, hook) => hook({ doc: d }),
			doc as Record<string, unknown>,
		);
		expect(result.verified).toBe(true);
		expect(result.phoneVerified).toBe(true);
	});

	it("declares verified as a virtual field, so nothing writes it", () => {
		const verified = (
			Users.fields as { name?: string; virtual?: boolean }[]
		).find((f) => f.name === "verified");
		expect(verified?.virtual).toBe(true);
	});

	it("no longer triggers the user-verified workflow", () => {
		const source = Users.hooks?.afterChange?.map(String).join("\n") ?? "";
		expect(source).not.toContain("user-verified");
	});
});
