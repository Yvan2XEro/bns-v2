import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS as mobileRolePermissions } from "../../../mobile/src/lib/shopRoles";
import { ROLE_PERMISSIONS as webRolePermissions } from "../../../web/src/lib/shop-roles";
import { ROLE_PERMISSIONS, SHOP_ROLES } from "../../src/access/shopRoles";

/**
 * The 63-cell permission matrix is hand-mirrored in both clients
 * (`packages/web/src/lib/shop-roles.ts`, `packages/mobile/src/lib/shopRoles.ts`)
 * rather than imported, for the same reason `verification-reason-lists.int.spec.ts`
 * gives for the reason lists: a client importing `access/shopRoles.ts` directly
 * drags Payload's type surface into a type-check where it does not resolve the
 * same way it does here.
 *
 * This file runs the other direction: it is API code, so it imports both
 * client mirrors into ITS OWN type-check and compares them against the real,
 * single source of truth at runtime, role by role. A test that transcribed a
 * second, hand-typed copy of the matrix (what each client's own test does)
 * only proves that copy matches itself — editing the API's table left every
 * one of those green. This one fails for real: change a permission on any
 * role in `access/shopRoles.ts` without updating both client mirrors, and the
 * corresponding assertion below fails.
 */
describe("the permission matrix stays in sync with both client mirrors", () => {
	it("web mirrors the API matrix role by role", () => {
		for (const role of SHOP_ROLES) {
			expect(webRolePermissions[role]).toEqual(ROLE_PERMISSIONS[role]);
		}
	});

	it("mobile mirrors the API matrix role by role", () => {
		for (const role of SHOP_ROLES) {
			expect(mobileRolePermissions[role]).toEqual(ROLE_PERMISSIONS[role]);
		}
	});
});
