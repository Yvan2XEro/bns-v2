import { describe, expect, test } from "bun:test";
import type { ShopRole } from "../types/api";
import { can, ROLE_PERMISSIONS, type ShopPermission } from "./shopRoles";

const ALL_PERMISSIONS: readonly ShopPermission[] = ROLE_PERMISSIONS.owner;

const MANAGER_ONLY_GAP: readonly ShopPermission[] = [
	"payments.manage",
	"team.manageManagers",
	"settings.handle",
	"verification.submit",
	"shop.close",
];

const STAFF_PERMISSIONS: readonly ShopPermission[] = [
	"catalogue.edit",
	"stock.move",
	"orders.view",
	"orders.process",
	"inbox.reply",
	"team.view",
];

describe("ROLE_PERMISSIONS mirrors the API matrix", () => {
	test("owner holds every permission", () => {
		for (const permission of ALL_PERMISSIONS) {
			expect(can("owner", permission)).toBe(true);
		}
	});

	test("manager holds everything except the five owner-only levers", () => {
		for (const permission of ALL_PERMISSIONS) {
			const expected = !MANAGER_ONLY_GAP.includes(permission);
			expect(can("manager", permission)).toBe(expected);
		}
	});

	test("staff holds exactly the six base permissions", () => {
		for (const permission of ALL_PERMISSIONS) {
			const expected = STAFF_PERMISSIONS.includes(permission);
			expect(can("staff", permission)).toBe(expected);
		}
	});

	test("the three role tables sum to the full permission list with no extra entry", () => {
		const roles: ShopRole[] = ["owner", "manager", "staff"];
		for (const role of roles) {
			for (const permission of ROLE_PERMISSIONS[role]) {
				expect(ALL_PERMISSIONS.includes(permission)).toBe(true);
			}
		}
	});
});

describe("can() with no usable role", () => {
	test("refuses every permission for null", () => {
		for (const permission of ALL_PERMISSIONS) {
			expect(can(null, permission)).toBe(false);
		}
	});

	test("refuses every permission for undefined", () => {
		for (const permission of ALL_PERMISSIONS) {
			expect(can(undefined, permission)).toBe(false);
		}
	});
});
