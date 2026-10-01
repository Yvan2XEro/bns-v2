import { describe, expect, test } from "bun:test";
import {
	can,
	canSeeCost,
	ROLE_PERMISSIONS,
	type ShopPermission,
} from "./shopRoles";

/**
 * Transcribed independently of `ROLE_PERMISSIONS`, the same way
 * `packages/web/src/lib/shop-roles.test.ts` and
 * `packages/api/tests/int/shop-permissions-parity.int.spec.ts` do: a literal
 * table, not a slice of the implementation looped back on itself. Deleting a
 * permission from the implementation must leave a row here with no match,
 * not shrink the thing being iterated along with it.
 */
const MATRIX: Array<[ShopPermission, boolean, boolean, boolean]> = [
	["catalogue.edit", true, true, true],
	["catalogue.archive", true, true, false],
	["stock.move", true, true, true],
	["costs.view", true, true, false],
	["costs.edit", true, true, false],
	["orders.view", true, true, true],
	["orders.process", true, true, true],
	["orders.cancel", true, true, false],
	["inbox.reply", true, true, true],
	["inbox.assignOthers", true, true, false],
	["payments.view", true, true, false],
	["payments.manage", true, false, false],
	["team.view", true, true, true],
	["team.inviteStaff", true, true, false],
	["team.manageManagers", true, false, false],
	["settings.edit", true, true, false],
	["settings.handle", true, false, false],
	["verification.submit", true, false, false],
	["resale.manage", true, true, false],
	["activity.view", true, true, false],
	["shop.close", true, false, false],
];

describe("ROLE_PERMISSIONS mirrors the API matrix", () => {
	test("matches the server's matrix exactly", () => {
		for (const [permission, owner, manager, staff] of MATRIX) {
			expect([permission, can("owner", permission)]).toEqual([
				permission,
				owner,
			]);
			expect([permission, can("manager", permission)]).toEqual([
				permission,
				manager,
			]);
			expect([permission, can("staff", permission)]).toEqual([
				permission,
				staff,
			]);
		}
	});

	test("declares 21, 16 and 6 permissions", () => {
		expect(ROLE_PERMISSIONS.owner.length).toBe(21);
		expect(ROLE_PERMISSIONS.manager.length).toBe(16);
		expect(ROLE_PERMISSIONS.staff.length).toBe(6);
	});
});

describe("can() with no usable role", () => {
	test("refuses every permission for null", () => {
		for (const [permission] of MATRIX) {
			expect(can(null, permission)).toBe(false);
		}
	});

	test("refuses every permission for undefined", () => {
		for (const [permission] of MATRIX) {
			expect(can(undefined, permission)).toBe(false);
		}
	});
});

describe("canSeeCost", () => {
	test("is costs.view", () => {
		expect(canSeeCost("owner")).toBe(true);
		expect(canSeeCost("manager")).toBe(true);
		expect(canSeeCost("staff")).toBe(false);
		expect(canSeeCost(null)).toBe(false);
	});
});
