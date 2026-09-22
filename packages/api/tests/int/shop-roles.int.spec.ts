// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	canManageShop,
	memberShopIds,
	resolveShopRole,
	shopField,
	withShopAccess,
} from "../../src/access/shopRoles";
import { fakePayload } from "./helpers/fakePayload";

const seed = () =>
	fakePayload({
		"shop-members": [
			{ id: "m-1", shop: "s-1", user: "u-1", role: "owner", status: "active" },
			{ id: "m-2", shop: "s-2", user: "u-1", role: "staff", status: "revoked" },
			{
				id: "m-3",
				shop: "s-3",
				user: "u-2",
				role: "manager",
				status: "active",
			},
		],
	});

describe("resolveShopRole", () => {
	it("returns the role of an active membership", async () => {
		expect(await resolveShopRole(seed(), "u-1", "s-1")).toBe("owner");
	});

	it("returns null for a revoked membership or a non-member", async () => {
		const payload = seed();
		expect(await resolveShopRole(payload, "u-1", "s-2")).toBeNull();
		expect(await resolveShopRole(payload, "u-9", "s-1")).toBeNull();
		expect(await resolveShopRole(payload, null, "s-1")).toBeNull();
	});

	it("caches the answer in the request context", async () => {
		const payload = seed();
		const context: Record<string, unknown> = {};
		expect(await resolveShopRole(payload, "u-1", "s-1", context)).toBe("owner");
		payload.store["shop-members"][0].status = "revoked";
		expect(await resolveShopRole(payload, "u-1", "s-1", context)).toBe("owner");
		expect(await resolveShopRole(payload, "u-1", "s-1")).toBeNull();
	});
});

describe("canManageShop", () => {
	it("is true for owners and managers only", () => {
		expect(canManageShop("owner")).toBe(true);
		expect(canManageShop("manager")).toBe(true);
		expect(canManageShop("staff")).toBe(false);
		expect(canManageShop(null)).toBe(false);
	});
});

describe("memberShopIds", () => {
	it("lists the shops where the caller has an active membership", async () => {
		const payload = seed();
		const req = { payload, user: { id: "u-1" }, context: {} } as never;
		expect(await memberShopIds(req)).toEqual(["s-1"]);
	});

	it("filters to shops the caller can manage", async () => {
		const payload = fakePayload({
			"shop-members": [
				{
					id: "m-1",
					shop: "s-1",
					user: "u-1",
					role: "owner",
					status: "active",
				},
				{
					id: "m-2",
					shop: "s-2",
					user: "u-1",
					role: "staff",
					status: "active",
				},
			],
		});
		const req = { payload, user: { id: "u-1" }, context: {} } as never;
		expect(await memberShopIds(req, { manage: true })).toEqual(["s-1"]);
	});

	it("is empty for an anonymous request", async () => {
		const req = { payload: seed(), user: null, context: {} } as never;
		expect(await memberShopIds(req)).toEqual([]);
	});

	it("is empty for a stranger with no membership at all", async () => {
		const req = { payload: seed(), user: { id: "u-9" }, context: {} } as never;
		expect(await memberShopIds(req)).toEqual([]);
	});
});

describe("withShopAccess", () => {
	const req = () =>
		({ payload: seed(), user: { id: "u-1" }, context: {} }) as never;

	it("keeps a refusal a refusal", async () => {
		const access = withShopAccess(() => false);
		expect(await access({ req: req() } as never)).toBe(false);
	});

	it("narrows a granted rule to the caller's shops", async () => {
		const access = withShopAccess(() => true);
		expect(await access({ req: req() } as never)).toEqual({
			shop: { in: ["s-1"] },
		});
	});

	it("ands the narrowing onto the rule's own where", async () => {
		const access = withShopAccess(() => ({ status: { equals: "draft" } }));
		expect(await access({ req: req() } as never)).toEqual({
			and: [{ status: { equals: "draft" } }, { shop: { in: ["s-1"] } }],
		});
	});

	it("leaves a stranger with no shop to match", async () => {
		const access = withShopAccess(() => true);
		const stranger = {
			payload: seed(),
			user: { id: "u-9" },
			context: {},
		} as never;
		expect(await access({ req: stranger } as never)).toEqual({
			shop: { in: [] },
		});
	});
});

describe("shopField", () => {
	it("is an indexed relationship whose picker holds only the caller's shops", async () => {
		const field = shopField({ required: true });
		expect(field).toMatchObject({
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			index: true,
			required: true,
		});
		const filter = field.filterOptions as (
			args: unknown,
		) => Promise<{ id: { in: string[] } }>;
		const req = { payload: seed(), user: { id: "u-2" }, context: {} };
		expect(await filter({ req })).toEqual({ id: { in: ["s-3"] } });
	});
});
