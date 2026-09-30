// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Users } from "../../src/collections/Users";

const beforeChange = Users.hooks?.beforeChange?.[0] as (args: {
	req: {
		context?: Record<string, unknown>;
		payload?: unknown;
		user?: { role?: string } | null;
	};
	data: Record<string, unknown>;
	operation: string;
	originalDoc?: Record<string, unknown>;
}) => Record<string, unknown>;

/**
 * A public signup is `POST /api/users` with `access.create: anyone` and no
 * authenticated actor — the same request shape services/verification.ts must
 * never be able to reach on its own account's behalf. If any of these three
 * fields survives a create, an account can grant itself a verification
 * badge at signup.
 */
describe("Users beforeChange on create", () => {
	it("strips a self-submitted identity verification from a public signup", () => {
		const result = beforeChange({
			req: { context: {} },
			operation: "create",
			data: {
				email: "new@example.com",
				name: "New User",
				identityVerifiedAt: "2026-01-01T00:00:00.000Z",
				identityVerification: "vr-1",
				legacyVerifiedAt: "2020-01-01T00:00:00.000Z",
			},
		});

		expect(result.identityVerifiedAt).toBeUndefined();
		expect(result.identityVerification).toBeUndefined();
		expect(result.legacyVerifiedAt).toBeUndefined();
	});

	it("still lets an admin-authored create set them", () => {
		const result = beforeChange({
			req: { context: {}, user: { role: "admin" } },
			operation: "create",
			data: {
				email: "seeded@example.com",
				identityVerifiedAt: "2026-01-01T00:00:00.000Z",
				identityVerification: "vr-1",
				legacyVerifiedAt: "2020-01-01T00:00:00.000Z",
			},
		});

		expect(result.identityVerifiedAt).toBe("2026-01-01T00:00:00.000Z");
		expect(result.identityVerification).toBe("vr-1");
		expect(result.legacyVerifiedAt).toBe("2020-01-01T00:00:00.000Z");
	});
});
