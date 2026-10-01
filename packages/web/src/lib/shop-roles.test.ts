import { describe, expect, test } from "bun:test";
import {
	can,
	canSeeCost,
	isShopOwner,
	ROLE_PERMISSIONS,
	type ShopPermission,
} from "./shop-roles";

/** The same table as `packages/api/tests/int/shop-permissions.int.spec.ts`. */
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

describe("can", () => {
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

	test("grants nothing without a role", () => {
		expect(can(null, "team.view")).toBe(false);
		expect(can(undefined, "catalogue.edit")).toBe(false);
	});

	test("declares 21, 16 and 6 permissions", () => {
		expect(ROLE_PERMISSIONS.owner.length).toBe(21);
		expect(ROLE_PERMISSIONS.manager.length).toBe(16);
		expect(ROLE_PERMISSIONS.staff.length).toBe(6);
	});
});

describe("the two aliases the shipped screens use", () => {
	test("canSeeCost is costs.view", () => {
		expect(canSeeCost("manager")).toBe(true);
		expect(canSeeCost("staff")).toBe(false);
	});

	test("isShopOwner is still the role, not a permission", () => {
		expect(isShopOwner("owner")).toBe(true);
		expect(isShopOwner("manager")).toBe(false);
	});
});
