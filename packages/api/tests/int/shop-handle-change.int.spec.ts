// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { requireShopMember } from "../../src/services/shopGuards";
import { changeShopHandle } from "../../src/services/shops";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const day = 86_400_000;
const iso = (offsetDays: number) =>
	new Date(NOW.getTime() + offsetDays * day).toISOString();

function seed(shop: Record<string, unknown> = {}) {
	return fakePayload(
		{
			users: [
				{ id: "u-1", name: "Aïcha", createdAt: iso(-400) },
				{ id: "u-2", name: "Other" },
				{ id: "u-3", name: "Manager" },
			],
			shops: [
				{
					id: "s-1",
					handle: "akwatech",
					name: "Akwa",
					owner: "u-1",
					status: "active",
					level: 1,
					previousHandles: [],
					handleChangedAt: null,
					...shop,
				},
				{
					id: "s-2",
					handle: "taken",
					name: "Other",
					owner: "u-2",
					status: "active",
					previousHandles: [],
				},
			],
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
					role: "owner",
					status: "active",
				},
				{
					id: "m-3",
					shop: "s-1",
					user: "u-3",
					role: "manager",
					status: "active",
				},
			],
		},
		{ uniques: { shops: [["handle"]] } },
	);
}

const U1 = { id: "u-1" };

describe("requireShopMember", () => {
	it("returns the shop and role of a member", async () => {
		const { shop, role } = await requireShopMember(seed(), U1, "s-1");
		expect(shop.id).toBe("s-1");
		expect(role).toBe("owner");
	});

	it("refuses a non-member with shop.notMember", async () => {
		await expect(
			requireShopMember(seed(), { id: "u-2" }, "s-1"),
		).rejects.toMatchObject({ code: "shop.notMember", status: 403 });
	});

	it("refuses a missing shop with shop.notFound", async () => {
		await expect(requireShopMember(seed(), U1, "nope")).rejects.toMatchObject({
			code: "shop.notFound",
			status: 404,
		});
	});

	it("refuses writes to a suspended shop", async () => {
		await expect(
			requireShopMember(seed({ status: "suspended" }), U1, "s-1", {
				writable: true,
			}),
		).rejects.toMatchObject({ code: "shop.inactive", status: 409 });
	});

	it("refuses writes from a suspended account", async () => {
		// assertNotSuspended reads the wall clock (no `now` parameter), so the
		// clock is pinned to the fixture's NOW for this one assertion.
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		const suspended = {
			id: "u-1",
			suspendedAt: iso(-1),
			suspendedUntil: iso(3),
		};
		try {
			await expect(
				requireShopMember(seed(), suspended, "s-1", { writable: true }),
			).rejects.toMatchObject({ status: 403 });
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("changeShopHandle", () => {
	it("switches the handle and keeps the old one for 90 days", async () => {
		const payload = seed();
		const result = await changeShopHandle(
			payload,
			U1,
			"s-1",
			"Akwa-Store",
			NOW,
		);

		expect(result.shop.handle).toBe("akwa-store");
		expect(result.nextHandleChangeAt).toBe(iso(30));
		const stored = payload.store.shops.find((s) => s.id === "s-1");
		expect(stored?.handleChangedAt).toBe(NOW.toISOString());
		expect(stored?.previousHandles).toEqual([
			{ handle: "akwatech", until: iso(90) },
		]);
	});

	it("refuses a second change within 30 days", async () => {
		await expect(
			changeShopHandle(
				seed({ handleChangedAt: iso(-10) }),
				U1,
				"s-1",
				"fresh",
				NOW,
			),
		).rejects.toMatchObject({ code: "shop.handleCooldown", status: 409 });
	});

	it("refuses a handle held by another shop", async () => {
		await expect(
			changeShopHandle(seed(), U1, "s-1", "taken", NOW),
		).rejects.toMatchObject({ code: "shop.handleTaken", status: 409 });
	});

	it("refuses a non-member", async () => {
		await expect(
			changeShopHandle(seed(), { id: "u-2" }, "s-1", "fresh", NOW),
		).rejects.toMatchObject({ code: "shop.notMember" });
	});

	it("refuses a manager with the same code as a non-member", async () => {
		await expect(
			changeShopHandle(seed(), { id: "u-3" }, "s-1", "fresh", NOW),
		).rejects.toMatchObject({ code: "shop.notMember", status: 403 });
	});

	it("refuses the current handle unchanged", async () => {
		await expect(
			changeShopHandle(seed(), U1, "s-1", "akwatech", NOW),
		).rejects.toMatchObject({ code: "generic.validation", status: 400 });
	});

	it("refuses a differently-spelled variant that normalises to the current handle", async () => {
		await expect(
			changeShopHandle(seed(), U1, "s-1", "@Akwatech", NOW),
		).rejects.toMatchObject({ code: "generic.validation", status: 400 });
	});

	it("lets a shop take back its own previous handle and drops that entry", async () => {
		const payload = seed({
			handle: "newer",
			previousHandles: [{ handle: "akwatech", until: iso(20) }],
			handleChangedAt: iso(-40),
		});
		await changeShopHandle(payload, U1, "s-1", "akwatech", NOW);
		const stored = payload.store.shops.find((s) => s.id === "s-1");
		expect(stored?.handle).toBe("akwatech");
		expect(stored?.previousHandles).toEqual([
			{ handle: "newer", until: iso(90) },
		]);
	});

	it("prunes expired previous handles", async () => {
		const payload = seed({
			previousHandles: [{ handle: "ancient", until: iso(-1) }],
		});
		await changeShopHandle(payload, U1, "s-1", "fresh", NOW);
		expect(
			payload.store.shops.find((s) => s.id === "s-1")?.previousHandles,
		).toEqual([{ handle: "akwatech", until: iso(90) }]);
	});
});
