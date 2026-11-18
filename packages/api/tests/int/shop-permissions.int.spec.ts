import { describe, expect, it } from "vitest";
import {
	can,
	memberShopIds,
	ROLE_PERMISSIONS,
	resolveShopRole,
	SHOP_PERMISSIONS,
	type ShopPermission,
	type ShopRole,
} from "../../src/access/shopRoles";
import { requireShopPermission } from "../../src/services/shopGuards";
import { fakePayload } from "./helpers/fakePayload";

/** The spec's table, transcribed. Row order is the spec's row order. */
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
	it("answers the whole matrix, every role against every permission", () => {
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

	it("grants nothing to a null or undefined role", () => {
		for (const [permission] of MATRIX) {
			expect(can(null, permission)).toBe(false);
			expect(can(undefined, permission)).toBe(false);
		}
	});

	it("covers every declared permission exactly once", () => {
		expect([...SHOP_PERMISSIONS].sort()).toEqual(MATRIX.map(([p]) => p).sort());
		expect(SHOP_PERMISSIONS.length).toBe(21);
		expect(ROLE_PERMISSIONS.owner.length).toBe(21);
		expect(ROLE_PERMISSIONS.manager.length).toBe(16);
		expect(ROLE_PERMISSIONS.staff.length).toBe(6);
	});
});

type SeedOptions = {
	shopStatus?: string;
	shopLevel?: number;
	levelExpiresAt?: string | null;
	memberStatus?: string;
	memberRole?: ShopRole;
	memberSuspendedAt?: string | null;
	memberSuspendedUntil?: string | null;
};

function seed(options: SeedOptions = {}) {
	return fakePayload({
		users: [
			{ id: "u-owner", role: "user", name: "Aicha" },
			{
				id: "u-member",
				role: "user",
				name: "Bruno",
				suspendedAt: options.memberSuspendedAt ?? null,
				suspendedUntil: options.memberSuspendedUntil ?? null,
			},
			{ id: "u-stranger", role: "user", name: "Clara" },
		],
		shops: [
			{
				id: "s-1",
				handle: "akwa",
				name: "Akwa",
				owner: "u-owner",
				status: options.shopStatus ?? "active",
				level: options.shopLevel ?? 2,
				levelExpiresAt: options.levelExpiresAt ?? null,
			},
		],
		"shop-members": [
			{
				id: "m-owner",
				shop: "s-1",
				user: "u-owner",
				role: "owner",
				status: "active",
			},
			{
				id: "m-1",
				shop: "s-1",
				user: "u-member",
				role: options.memberRole ?? "manager",
				status: options.memberStatus ?? "active",
			},
		],
	});
}

const user = (id: string) => ({
	id,
	role: "user",
	name: null,
	suspendedAt: null,
	suspendedUntil: null,
});

describe("resolveShopRole", () => {
	it("returns the role of an active member of an active level-2 shop", async () => {
		const payload = seed();
		expect(await resolveShopRole(payload, "u-member", "s-1", {})).toBe(
			"manager",
		);
	});

	it("returns null for a revoked membership", async () => {
		const payload = seed({ memberStatus: "revoked" });
		expect(await resolveShopRole(payload, "u-member", "s-1", {})).toBeNull();
	});

	it("returns null for a suspended non-owner and keeps the owner's role", async () => {
		const payload = seed({
			memberSuspendedAt: "2026-09-01T00:00:00.000Z",
			memberSuspendedUntil: null,
		});
		expect(await resolveShopRole(payload, "u-member", "s-1", {})).toBeNull();
		expect(await resolveShopRole(payload, "u-owner", "s-1", {})).toBe("owner");
	});

	it("restores a non-owner once the suspension has elapsed", async () => {
		const payload = seed({
			memberSuspendedAt: "2026-09-01T00:00:00.000Z",
			memberSuspendedUntil: "2026-09-02T00:00:00.000Z",
		});
		expect(await resolveShopRole(payload, "u-member", "s-1", {})).toBe(
			"manager",
		);
	});

	it("returns null for a non-owner on a suspended shop and keeps the owner's role", async () => {
		const payload = seed({ shopStatus: "suspended" });
		expect(await resolveShopRole(payload, "u-member", "s-1", {})).toBeNull();
		expect(await resolveShopRole(payload, "u-owner", "s-1", {})).toBe("owner");
	});

	it("returns null for a non-owner on a closed shop", async () => {
		const payload = seed({ shopStatus: "closed" });
		expect(await resolveShopRole(payload, "u-member", "s-1", {})).toBeNull();
	});

	it("returns null for a non-owner when the team capability is off below level 2", async () => {
		const payload = seed({ shopLevel: 1 });
		expect(await resolveShopRole(payload, "u-member", "s-1", {})).toBeNull();
		expect(await resolveShopRole(payload, "u-owner", "s-1", {})).toBe("owner");
	});

	it("returns null for a non-owner when the level has expired at read time", async () => {
		const payload = seed({
			shopLevel: 2,
			levelExpiresAt: "2020-01-01T00:00:00.000Z",
		});
		expect(await resolveShopRole(payload, "u-member", "s-1", {})).toBeNull();
	});

	it("returns null for someone with no membership row", async () => {
		const payload = seed();
		expect(await resolveShopRole(payload, "u-stranger", "s-1", {})).toBeNull();
	});

	it("reads the shop and the user once per request, not once per call", async () => {
		const payload = seed();
		const context: Record<string, unknown> = {};
		await resolveShopRole(payload, "u-member", "s-1", context);
		const before = payload.reads.length;
		await resolveShopRole(payload, "u-member", "s-1", context);
		expect(payload.reads.length).toBe(before);
	});

	it("does not re-read the shop for a second member of the same shop", async () => {
		const payload = seed();
		const context: Record<string, unknown> = {};
		await resolveShopRole(payload, "u-member", "s-1", context);
		const shopReads = payload.reads.filter(
			(r) => r.collection === "shops",
		).length;
		await resolveShopRole(payload, "u-owner", "s-1", context);
		expect(payload.reads.filter((r) => r.collection === "shops").length).toBe(
			shopReads,
		);
	});
});

describe("memberShopIds", () => {
	const req = (payload: ReturnType<typeof seed>, userId: string) =>
		({ payload, user: { id: userId }, context: {} }) as never;

	it("lists the shops where the caller holds the named permission", async () => {
		const payload = seed({ memberRole: "staff" });
		expect(
			await memberShopIds(req(payload, "u-member"), {
				permission: "inbox.reply",
			}),
		).toEqual(["s-1"]);
		expect(
			await memberShopIds(req(payload, "u-member"), {
				permission: "settings.edit",
			}),
		).toEqual([]);
	});

	it("drops a dormant shop for a non-owner and keeps it for the owner", async () => {
		const payload = seed({ shopLevel: 1 });
		expect(
			await memberShopIds(req(payload, "u-member"), {
				permission: "team.view",
			}),
		).toEqual([]);
		expect(
			await memberShopIds(req(payload, "u-owner"), { permission: "team.view" }),
		).toEqual(["s-1"]);
	});
});

describe("requireShopPermission", () => {
	it("returns the shop and the role when the permission is held", async () => {
		const payload = seed();
		const result = await requireShopPermission(
			payload,
			user("u-member"),
			"s-1",
			"settings.edit",
		);
		expect(result.role).toBe("manager");
		expect(result.shop.id).toBe("s-1");
	});

	it("refuses with shop.forbidden when the role lacks the permission", async () => {
		const payload = seed({ memberRole: "staff" });
		await expect(
			requireShopPermission(payload, user("u-member"), "s-1", "costs.view"),
		).rejects.toMatchObject({ code: "shop.forbidden", status: 403 });
	});

	it("refuses with shop.notMember when there is no role at all", async () => {
		const payload = seed();
		await expect(
			requireShopPermission(payload, user("u-stranger"), "s-1", "team.view"),
		).rejects.toMatchObject({ code: "shop.notMember", status: 403 });
	});

	it("refuses with shop.notFound for an unknown shop", async () => {
		const payload = seed();
		await expect(
			requireShopPermission(payload, user("u-owner"), "s-missing", "team.view"),
		).rejects.toMatchObject({ code: "shop.notFound", status: 404 });
	});

	it("refuses a writable call on a non-active shop with shop.inactive", async () => {
		const payload = seed({ shopStatus: "suspended" });
		await expect(
			requireShopPermission(payload, user("u-owner"), "s-1", "catalogue.edit", {
				writable: true,
			}),
		).rejects.toMatchObject({ code: "shop.inactive", status: 409 });
	});
});
