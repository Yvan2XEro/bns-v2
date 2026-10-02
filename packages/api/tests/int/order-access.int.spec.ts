// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	maskPhone,
	requireOrderAudience,
	requireOrderShopPermission,
	resolveOrderAudience,
} from "../../src/access/orderAccess";
import { fakePayload } from "./helpers/fakePayload";

function seed() {
	return fakePayload({
		users: [
			{ id: "u-buyer", role: "user" },
			{ id: "u-buyer-2", role: "user" },
			{ id: "u-owner", role: "user" },
			{ id: "u-manager", role: "user" },
			{ id: "u-staff", role: "user" },
			{ id: "u-revoked", role: "user" },
			{
				id: "u-suspended",
				role: "user",
				suspendedAt: "2026-09-01T00:00:00.000Z",
				suspendedUntil: null,
			},
			{ id: "u-owner-2", role: "user" },
		],
		shops: [
			{ id: "s-1", status: "active", owner: "u-owner", level: 2 },
			{ id: "s-2", status: "active", owner: "u-owner-2", level: 2 },
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
				id: "m-manager",
				shop: "s-1",
				user: "u-manager",
				role: "manager",
				status: "active",
			},
			{
				id: "m-staff",
				shop: "s-1",
				user: "u-staff",
				role: "staff",
				status: "active",
			},
			{
				id: "m-revoked",
				shop: "s-1",
				user: "u-revoked",
				role: "staff",
				status: "revoked",
			},
			{
				id: "m-suspended",
				shop: "s-1",
				user: "u-suspended",
				role: "staff",
				status: "active",
			},
			{
				id: "m-owner-2",
				shop: "s-2",
				user: "u-owner-2",
				role: "owner",
				status: "active",
			},
		],
		orders: [{ id: "o-1", shop: "s-1", buyer: "u-buyer", status: "placed" }],
	});
}

const BUYER = { id: "u-buyer", role: "user" };
const OTHER_BUYER = { id: "u-buyer-2", role: "user" };
const OWNER = { id: "u-owner", role: "user" };
const MANAGER = { id: "u-manager", role: "user" };
const STAFF = { id: "u-staff", role: "user" };
const REVOKED = { id: "u-revoked", role: "user" };
const SUSPENDED = { id: "u-suspended", role: "user" };
const OTHER_SHOP_OWNER = { id: "u-owner-2", role: "user" };
const MODERATOR = { id: "u-mod", role: "moderator" };
const ADMIN = { id: "u-admin", role: "admin" };

describe("resolveOrderAudience / requireOrderAudience: the eight viewpoints", () => {
	it("resolves the buyer to { kind: 'buyer' }", async () => {
		const payload = seed();
		const { audience } = await requireOrderAudience(payload, BUYER, "o-1");
		expect(audience).toEqual({ kind: "buyer" });
	});

	it("resolves another buyer (not a party) to order.notFound, not 403", async () => {
		const payload = seed();
		await expect(
			requireOrderAudience(payload, OTHER_BUYER, "o-1"),
		).rejects.toMatchObject({ code: "order.notFound", status: 404 });
	});

	it("resolves the shop's owner to { kind: 'shop', role: 'owner' }", async () => {
		const payload = seed();
		const { audience } = await requireOrderAudience(payload, OWNER, "o-1");
		expect(audience).toEqual({ kind: "shop", role: "owner" });
	});

	it("resolves the shop's manager to { kind: 'shop', role: 'manager' }", async () => {
		const payload = seed();
		const { audience } = await requireOrderAudience(payload, MANAGER, "o-1");
		expect(audience).toEqual({ kind: "shop", role: "manager" });
	});

	it("resolves the shop's staff to { kind: 'shop', role: 'staff' }", async () => {
		const payload = seed();
		const { audience } = await requireOrderAudience(payload, STAFF, "o-1");
		expect(audience).toEqual({ kind: "shop", role: "staff" });
	});

	it("resolves a different shop's owner to order.notFound, not 403", async () => {
		const payload = seed();
		await expect(
			requireOrderAudience(payload, OTHER_SHOP_OWNER, "o-1"),
		).rejects.toMatchObject({ code: "order.notFound", status: 404 });
	});

	it("resolves a moderator to { kind: 'staff' }", async () => {
		const payload = seed();
		const { audience } = await requireOrderAudience(payload, MODERATOR, "o-1");
		expect(audience).toEqual({ kind: "staff" });
	});

	it("resolves an admin to { kind: 'staff' } too — rank, not an exact role string", async () => {
		const payload = seed();
		const { audience } = await requireOrderAudience(payload, ADMIN, "o-1");
		expect(audience).toEqual({ kind: "staff" });
	});

	it("gives an anonymous caller order.notFound, never 403", async () => {
		const payload = seed();
		await expect(
			requireOrderAudience(payload, null, "o-1"),
		).rejects.toMatchObject({ code: "order.notFound", status: 404 });
	});

	it("never throws 403 for a non-party — a 403 would confirm the order exists", async () => {
		const payload = seed();
		for (const caller of [null, OTHER_BUYER, OTHER_SHOP_OWNER]) {
			await expect(
				requireOrderAudience(payload, caller, "o-1"),
			).rejects.toMatchObject({ status: 404 });
		}
	});
});

describe("resolveOrderAudience: dormant membership", () => {
	it("resolves a revoked member of the shop to nothing", async () => {
		const payload = seed();
		const order = await payload.findByID({ collection: "orders", id: "o-1" });
		expect(await resolveOrderAudience(payload, REVOKED, order)).toBeNull();
	});

	it("resolves a suspended member of the shop to nothing", async () => {
		const payload = seed();
		const order = await payload.findByID({ collection: "orders", id: "o-1" });
		expect(await resolveOrderAudience(payload, SUSPENDED, order)).toBeNull();
	});

	it("turns a dormant member's read into order.notFound through requireOrderAudience", async () => {
		const payload = seed();
		await expect(
			requireOrderAudience(payload, REVOKED, "o-1"),
		).rejects.toMatchObject({ code: "order.notFound", status: 404 });
	});
});

describe("requireOrderShopPermission: an action, not a read", () => {
	it("lets the owner cancel (orders.cancel is on the owner's matrix row)", async () => {
		const payload = seed();
		const { role } = await requireOrderShopPermission(
			payload,
			OWNER,
			"o-1",
			"orders.cancel",
		);
		expect(role).toBe("owner");
	});

	it("refuses staff orders.cancel with shop.forbidden — staff holds orders.process, not orders.cancel", async () => {
		const payload = seed();
		await expect(
			requireOrderShopPermission(payload, STAFF, "o-1", "orders.cancel"),
		).rejects.toMatchObject({ code: "shop.forbidden", status: 403 });
	});

	it("refuses the buyer with shop.notMember — a party, but not a shop one", async () => {
		const payload = seed();
		await expect(
			requireOrderShopPermission(payload, BUYER, "o-1", "orders.process"),
		).rejects.toMatchObject({ code: "shop.notMember", status: 403 });
	});

	it("refuses a moderator with shop.notMember — staff is not a shop role", async () => {
		const payload = seed();
		await expect(
			requireOrderShopPermission(payload, MODERATOR, "o-1", "orders.process"),
		).rejects.toMatchObject({ code: "shop.notMember", status: 403 });
	});

	it("refuses a stranger with order.notFound, not a permission error", async () => {
		const payload = seed();
		await expect(
			requireOrderShopPermission(payload, OTHER_BUYER, "o-1", "orders.process"),
		).rejects.toMatchObject({ code: "order.notFound", status: 404 });
	});
});

describe("maskPhone", () => {
	it("keeps the last two digits and the country code", () => {
		expect(maskPhone("+237600000012")).toBe("+2376••••••12");
	});

	it("masks a national number's middle digits one bullet per digit", () => {
		expect(maskPhone("+237612345678")).toBe("+2376••••••78");
	});
});
