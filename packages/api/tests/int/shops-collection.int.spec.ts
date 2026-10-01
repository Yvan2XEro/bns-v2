// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const queueSearchEvent = vi.fn(async () => undefined);
vi.mock("../../src/hooks/searchEvents", () => ({ queueSearchEvent }));

import { Shops } from "../../src/collections/Shops";
import { Users } from "../../src/collections/Users";
import { fakePayload } from "./helpers/fakePayload";

const beforeChange = Shops.hooks?.beforeChange?.[0] as (
	args: unknown,
) => Promise<Record<string, unknown>>;
const afterChange = Shops.hooks?.afterChange?.[0] as (
	args: unknown,
) => Promise<unknown>;
const readAccess = Shops.access?.read as (args: unknown) => unknown;
const updateAccess = Shops.access?.update as (
	args: unknown,
) => Promise<unknown>;

const original = {
	id: "s-1",
	handle: "akwatech",
	name: "Akwa Tech",
	owner: "u-1",
	status: "active",
	level: 1,
	publishedListingCount: 4,
	previousHandles: [],
	handleChangedAt: null,
	suspendedAt: null,
	levelExpiresAt: null,
	verifiedAt: null,
	legal: {
		businessType: null,
		legalName: null,
		rccmNumber: null,
		niu: null,
		verifiedAt: null,
	},
};

describe("Shops beforeChange", () => {
	beforeEach(() => queueSearchEvent.mockClear());

	it("pins service-owned fields on a member's update", async () => {
		const payload = fakePayload({ users: [{ id: "u-1" }] });
		const result = await beforeChange({
			operation: "update",
			originalDoc: original,
			data: {
				...original,
				name: "Akwa Tech Store",
				handle: "stolen",
				status: "active",
				level: 3,
				owner: "u-9",
				publishedListingCount: 999,
			},
			req: { payload, user: { id: "u-1" }, context: {} },
		});

		expect(result.name).toBe("Akwa Tech Store");
		expect(result.handle).toBe("akwatech");
		expect(result.level).toBe(1);
		expect(result.owner).toBe("u-1");
		expect(result.publishedListingCount).toBe(4);
	});

	it("lets the shop service write its fields", async () => {
		const payload = fakePayload();
		const result = await beforeChange({
			operation: "update",
			originalDoc: original,
			data: { ...original, handle: "akwa", level: 2 },
			req: { payload, user: null, context: { shopService: true } },
		});
		expect(result.handle).toBe("akwa");
		expect(result.level).toBe(2);
	});

	it("pins levelExpiresAt and verifiedAt on a member's update", async () => {
		const payload = fakePayload({ users: [{ id: "u-1" }] });
		const result = await beforeChange({
			operation: "update",
			originalDoc: original,
			data: {
				...original,
				levelExpiresAt: "2099-01-01T00:00:00.000Z",
				verifiedAt: "2099-01-01T00:00:00.000Z",
			},
			req: { payload, user: { id: "u-1" }, context: {} },
		});
		expect(result.levelExpiresAt).toBe(null);
		expect(result.verifiedAt).toBe(null);
	});

	it("freezes the legal block once level 3 is effective", async () => {
		const payload = fakePayload({ users: [{ id: "u-1" }] });
		const level3 = {
			...original,
			level: 3,
			legal: {
				businessType: "company",
				legalName: "Akwa Tech SARL",
				rccmNumber: "RC/DLA/2020/B/1234",
				niu: "M012312345678N",
				verifiedAt: "2026-01-01T00:00:00.000Z",
			},
		};
		const result = await beforeChange({
			operation: "update",
			originalDoc: level3,
			data: {
				...level3,
				legal: {
					businessType: "sole_trader",
					legalName: "Renamed",
					rccmNumber: "forged",
					niu: "forged",
					verifiedAt: "2030-01-01T00:00:00.000Z",
				},
			},
			req: { payload, user: { id: "u-1" }, context: {} },
		});
		expect(result.legal).toEqual(level3.legal);
	});

	it("I4: keeps the legal block editable once an effective level 3 has expired, rather than silently discarding the edit", async () => {
		const payload = fakePayload({ users: [{ id: "u-1" }] });
		// The stored `level` is still 3 — the nightly job has not recomputed it
		// yet — but `levelExpiresAt` is in the past, so `shopCapabilities` reads
		// this shop as effective level 1, exactly what a buyer is shown.
		const expiredLevel3 = {
			...original,
			level: 3,
			levelExpiresAt: "2020-01-01T00:00:00.000Z",
			legal: {
				businessType: "company",
				legalName: "Akwa Tech SARL",
				rccmNumber: "RC/DLA/2020/B/1234",
				niu: "M012312345678N",
				verifiedAt: "2026-01-01T00:00:00.000Z",
			},
		};
		const result = await beforeChange({
			operation: "update",
			originalDoc: expiredLevel3,
			data: {
				...expiredLevel3,
				legal: {
					businessType: "sole_trader",
					legalName: "Renamed",
					rccmNumber: "RC/DLA/2021/B/9999",
					niu: "M012312345678N",
					verifiedAt: "2030-01-01T00:00:00.000Z",
				},
			},
			req: { payload, user: { id: "u-1" }, context: {} },
		});
		expect((result.legal as { legalName: unknown }).legalName).toBe("Renamed");
		// `verifiedAt` still isn't a member's to set: below effective level 3 it
		// is stripped back to whatever was last stored, same as any other
		// below-level-3 shop.
		expect((result.legal as { verifiedAt: unknown }).verifiedAt).toBe(
			"2026-01-01T00:00:00.000Z",
		);
	});

	it("strips a member-submitted legal.verifiedAt while the shop is below level 3, but keeps the rest of legal editable", async () => {
		const payload = fakePayload({ users: [{ id: "u-1" }] });
		const result = await beforeChange({
			operation: "update",
			originalDoc: original,
			data: {
				...original,
				legal: {
					businessType: "company",
					legalName: "Akwa Tech SARL",
					rccmNumber: "RC/DLA/2020/B/1234",
					niu: "M012312345678N",
					verifiedAt: "2030-01-01T00:00:00.000Z",
				},
			},
			req: { payload, user: { id: "u-1" }, context: {} },
		});
		expect((result.legal as { verifiedAt: unknown }).verifiedAt).toBe(null);
		expect((result.legal as { businessType: unknown }).businessType).toBe(
			"company",
		);
	});

	it("C1: an owner cannot re-stamp legal.verifiedAt after a revocation clears it, even by resending it verbatim", async () => {
		const payload = fakePayload({ users: [{ id: "u-1" }] });
		// The exact post-revoke row: level dropped to 2, `legal`'s declared
		// fields still carry what was reviewed, but `verifiedAt` is already
		// null — `recomputeShopLevel` cleared it in the same write as the
		// level drop (services/verificationLevel.ts).
		const postRevoke = {
			...original,
			level: 2,
			legal: {
				businessType: "company",
				legalName: "Akwa Tech SARL",
				rccmNumber: "RC/DLA/2020/B/1234",
				niu: "M012312345678N",
				verifiedAt: null,
			},
		};
		const result = await beforeChange({
			operation: "update",
			originalDoc: postRevoke,
			data: {
				...postRevoke,
				legal: { ...postRevoke.legal, verifiedAt: "2030-01-01T00:00:00.000Z" },
			},
			req: { payload, user: { id: "u-1" }, context: {} },
		});
		expect((result.legal as { verifiedAt: unknown }).verifiedAt).toBe(null);
		expect((result.legal as { legalName: unknown }).legalName).toBe(
			"Akwa Tech SARL",
		);
	});

	it("refuses a member's edit on a suspended shop", async () => {
		const payload = fakePayload({ users: [{ id: "u-1" }] });
		await expect(
			beforeChange({
				operation: "update",
				originalDoc: { ...original, status: "suspended" },
				data: { ...original, status: "suspended", name: "New" },
				req: { payload, user: { id: "u-1" }, context: {} },
			}),
		).rejects.toMatchObject({ data: { code: "shop.inactive" } });
	});

	it("refuses an edit by a suspended account", async () => {
		const payload = fakePayload({ users: [{ id: "u-1" }] });
		await expect(
			beforeChange({
				operation: "update",
				originalDoc: original,
				data: { ...original, name: "New" },
				req: {
					payload,
					user: {
						id: "u-1",
						suspendedAt: "2026-01-01T00:00:00.000Z",
						suspendedUntil: null,
					},
					context: {},
				},
			}),
		).rejects.toMatchObject({ data: { code: "moderation.accountSuspended" } });
	});
});

describe("Shops afterChange", () => {
	beforeEach(() => queueSearchEvent.mockClear());

	it("asks for a listing reindex when the name changes", async () => {
		await afterChange({
			operation: "update",
			doc: { ...original, name: "Other" },
			previousDoc: original,
			req: { context: {} },
		});
		expect(queueSearchEvent).toHaveBeenCalledWith(
			expect.anything(),
			"shop.updated",
			"s-1",
			{
				reindexListings: true,
			},
		);
	});

	it("does not reindex listings for a description change", async () => {
		await afterChange({
			operation: "update",
			doc: { ...original, description: "New" },
			previousDoc: original,
			req: { context: {} },
		});
		expect(queueSearchEvent).toHaveBeenCalledWith(
			expect.anything(),
			"shop.updated",
			"s-1",
			{
				reindexListings: false,
			},
		);
	});

	it("publishes shop.created on create", async () => {
		await afterChange({
			operation: "create",
			doc: original,
			req: { context: {} },
		});
		expect(queueSearchEvent).toHaveBeenCalledWith(
			expect.anything(),
			"shop.created",
			"s-1",
			{
				reindexListings: false,
			},
		);
	});
});

describe("Shops read access", () => {
	it("shows only active shops to the public", () => {
		expect(readAccess({ req: { user: null } })).toEqual({
			status: { equals: "active" },
		});
	});

	it("shows owners their own shops in every status", () => {
		expect(readAccess({ req: { user: { id: "u-1", role: "user" } } })).toEqual({
			or: [{ status: { equals: "active" } }, { owner: { equals: "u-1" } }],
		});
	});

	it("shows staff everything", () => {
		expect(readAccess({ req: { user: { id: "m", role: "moderator" } } })).toBe(
			true,
		);
	});
});

describe("Shops update access", () => {
	const members = () =>
		fakePayload({
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
					user: "u-2",
					role: "staff",
					status: "active",
				},
			],
		});

	it("refuses an anonymous request", async () => {
		expect(
			await updateAccess({
				req: { payload: members(), user: null, context: {} },
			}),
		).toBe(false);
	});

	it("gives a stranger no shop", async () => {
		expect(
			await updateAccess({
				req: { payload: members(), user: { id: "u-9" }, context: {} },
			}),
		).toEqual({ id: { in: [] } });
	});

	it("never widens a member to another member's shop", async () => {
		expect(
			await updateAccess({
				req: { payload: members(), user: { id: "u-1" }, context: {} },
			}),
		).toEqual({ id: { in: ["s-1"] } });
	});

	it("refuses a member who cannot manage the shop", async () => {
		expect(
			await updateAccess({
				req: { payload: members(), user: { id: "u-2" }, context: {} },
			}),
		).toEqual({ id: { in: [] } });
	});

	it("does not hand a moderator every shop", async () => {
		expect(
			await updateAccess({
				req: {
					payload: members(),
					user: { id: "u-9", role: "moderator" },
					context: {},
				},
			}),
		).toEqual({ id: { in: [] } });
	});

	it("lets an admin update any shop", async () => {
		expect(
			await updateAccess({
				req: {
					payload: members(),
					user: { id: "a-1", role: "admin" },
					context: {},
				},
			}),
		).toBe(true);
	});
});

describe("shop-members read access", () => {
	it("shows a member their own rows plus every row of a shop where they hold team.view, nothing to an anonymous caller, everything to a moderator", async () => {
		const { ShopMembers } = await import("../../src/collections/ShopMembers");
		const read = ShopMembers.access?.read as (
			args: unknown,
		) => Promise<unknown>;
		const payload = fakePayload({
			"shop-members": [
				{
					id: "m-1",
					shop: "s-1",
					user: "u-1",
					role: "owner",
					status: "active",
				},
			],
		});
		expect(await read({ req: { user: null } })).toBe(false);
		expect(
			await read({
				req: { payload, user: { id: "u-1", role: "user" }, context: {} },
			}),
		).toEqual({
			or: [{ user: { equals: "u-1" } }, { shop: { in: ["s-1"] } }],
		});
		expect(await read({ req: { user: { id: "m", role: "moderator" } } })).toBe(
			true,
		);
	});

	it("never lets a client write a membership", async () => {
		const { ShopMembers } = await import("../../src/collections/ShopMembers");
		const args = { req: { user: { id: "u-1", role: "admin" } } };
		expect((ShopMembers.access?.create as (a: unknown) => unknown)(args)).toBe(
			false,
		);
		expect((ShopMembers.access?.update as (a: unknown) => unknown)(args)).toBe(
			false,
		);
		expect((ShopMembers.access?.delete as (a: unknown) => unknown)(args)).toBe(
			false,
		);
	});
});

describe("users.phoneVerified", () => {
	it("is derived from phoneVerifiedAt before field access strips it", async () => {
		const beforeRead = Users.hooks?.beforeRead?.[0] as (
			args: unknown,
		) => Record<string, unknown>;
		expect(
			beforeRead({ doc: { id: "u", phoneVerifiedAt: "2026-01-01" } })
				.phoneVerified,
		).toBe(true);
		expect(
			beforeRead({ doc: { id: "u", phoneVerifiedAt: null } }).phoneVerified,
		).toBe(false);
	});
});

describe("getShopSettings", () => {
	it("reads the toggle and the per-user limit from the global", async () => {
		const { getShopSettings } = await import("../../src/lib/shopSettings");
		const payload = fakePayload(
			{},
			{
				globals: {
					"app-settings": { shops: { enabled: true, maxPerUser: 3 } },
				},
			},
		);
		expect(await getShopSettings(payload)).toEqual({
			enabled: true,
			maxPerUser: 3,
		});
	});

	it("fails closed when the global is missing or unreadable", async () => {
		const { getShopSettings } = await import("../../src/lib/shopSettings");
		expect(await getShopSettings(fakePayload())).toEqual({
			enabled: false,
			maxPerUser: 1,
		});
	});
});
