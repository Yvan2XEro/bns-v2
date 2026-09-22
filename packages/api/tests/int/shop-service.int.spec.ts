// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkHandleAvailability, createShop } from "../../src/services/shops";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const daysAgo = (n: number) =>
	new Date(NOW.getTime() - n * 86_400_000).toISOString();
const inDays = (n: number) =>
	new Date(NOW.getTime() + n * 86_400_000).toISOString();

function seed(extra: Record<string, unknown[]> = {}, enabled = true) {
	return fakePayload(
		{
			users: [
				{
					id: "u-1",
					name: "Aïcha",
					role: "user",
					phoneVerifiedAt: daysAgo(3),
					createdAt: daysAgo(400),
					rating: 4.8,
					totalReviews: 12,
					homeLocation: {
						city: "Douala",
						region: "Littoral",
						country: "Cameroun",
						countryCode: "CM",
					},
				},
				{ id: "u-2", name: "No phone", role: "user", phoneVerifiedAt: null },
				{
					id: "u-3",
					name: "Suspended",
					role: "user",
					phoneVerifiedAt: daysAgo(3),
					suspendedAt: daysAgo(1),
					suspendedUntil: inDays(5),
				},
			],
			shops: [],
			"shop-members": [],
			...(extra as Record<string, never[]>),
		},
		{
			uniques: { shops: [["handle"]] },
			globals: { "app-settings": { shops: { enabled, maxPerUser: 1 } } },
		},
	);
}

const U1 = { id: "u-1", role: "user" };

describe("createShop", () => {
	it("creates an active level-1 shop and its owner membership", async () => {
		const payload = seed();
		const shop = await createShop(
			payload,
			U1,
			{
				handle: "AkwaTech",
				name: " Akwa Tech Store ",
				city: "Douala",
				categories: ["c-1", "c-1", "c-2"],
			},
			NOW,
		);

		expect(shop).toMatchObject({
			handle: "akwatech",
			name: "Akwa Tech Store",
			level: 1,
		});
		expect(payload.store.shops[0]).toMatchObject({
			status: "active",
			level: 1,
			owner: "u-1",
			categories: ["c-1", "c-2"],
			location: {
				city: "Douala",
				region: "Littoral",
				country: "Cameroun",
				countryCode: "CM",
			},
		});
		expect(payload.store["shop-members"][0]).toMatchObject({
			shop: payload.store.shops[0].id,
			user: "u-1",
			role: "owner",
			status: "active",
		});
		expect(payload.writes.every((w) => w.transactionID)).toBe(true);
	});

	it("refuses when shops are disabled", async () => {
		await expect(
			createShop(
				seed({}, false),
				U1,
				{ handle: "akwatech", name: "Akwa" },
				NOW,
			),
		).rejects.toMatchObject({
			code: "shop.disabled",
			status: 403,
		});
	});

	it("refuses an unverified phone", async () => {
		await expect(
			createShop(
				seed(),
				{ id: "u-2" },
				{ handle: "akwatech", name: "Akwa" },
				NOW,
			),
		).rejects.toMatchObject({ code: "shop.phoneNotVerified", status: 403 });
	});

	it("refuses a suspended account", async () => {
		await expect(
			createShop(
				seed(),
				{ id: "u-3" },
				{ handle: "akwatech", name: "Akwa" },
				NOW,
			),
		).rejects.toMatchObject({
			code: "moderation.accountSuspended",
			status: 403,
		});
	});

	it("refuses a second shop", async () => {
		const payload = seed({
			shops: [
				{ id: "shops-90", handle: "first", owner: "u-1", status: "active" },
			],
		});
		await expect(
			createShop(payload, U1, { handle: "second", name: "Second" }, NOW),
		).rejects.toMatchObject({
			code: "shop.limitReached",
			status: 409,
		});
	});

	it("does not count a closed shop against the limit", async () => {
		const payload = seed({
			shops: [
				{
					id: "shops-90",
					handle: "first",
					owner: "u-1",
					status: "closed",
					closedAt: daysAgo(1),
				},
			],
		});
		await expect(
			createShop(payload, U1, { handle: "second", name: "Second" }, NOW),
		).resolves.toMatchObject({
			handle: "second",
		});
	});

	it("maps handle problems to their codes", async () => {
		await expect(
			createShop(seed(), U1, { handle: "a", name: "Akwa" }, NOW),
		).rejects.toMatchObject({
			code: "shop.handleInvalid",
			status: 400,
		});
		await expect(
			createShop(seed(), U1, { handle: "boutique", name: "Akwa" }, NOW),
		).rejects.toMatchObject({
			code: "shop.handleReserved",
			status: 400,
		});
		const taken = seed({
			shops: [
				{ id: "shops-90", handle: "akwatech", owner: "u-9", status: "active" },
			],
		});
		await expect(
			createShop(taken, U1, { handle: "akwatech", name: "Akwa" }, NOW),
		).rejects.toMatchObject({
			code: "shop.handleTaken",
			status: 409,
		});
	});

	it("refuses a name outside 2-60 characters", async () => {
		await expect(
			createShop(seed(), U1, { handle: "akwatech", name: "A" }, NOW),
		).rejects.toMatchObject({
			code: "generic.validation",
			status: 400,
		});
	});

	it("leaves nothing behind when the membership cannot be written", async () => {
		const payload = seed();
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "shop-members";
		await expect(
			createShop(payload, U1, { handle: "akwatech", name: "Akwa" }, NOW),
		).rejects.toThrow();
		expect(payload.store.shops).toHaveLength(0);
	});

	it("maps a unique-index race to handleTaken", async () => {
		const payload = seed();
		payload.failWhen = (method, args) => {
			if (method === "create" && args.collection === "shops") {
				throw Object.assign(new Error("Value must be unique"), {
					name: "ValidationError",
					data: {
						errors: [{ message: "Value must be unique", path: "handle" }],
					},
				});
			}
			return false;
		};
		await expect(
			createShop(payload, U1, { handle: "akwatech", name: "Akwa" }, NOW),
		).rejects.toMatchObject({
			code: "shop.handleTaken",
		});
	});
});

describe("checkHandleAvailability", () => {
	it("reports a free handle", async () => {
		expect(
			await checkHandleAvailability(seed(), "akwatech", { now: NOW }),
		).toEqual({
			available: true,
			reason: null,
			handle: "akwatech",
		});
	});

	it("reports a handle still held as another shop's previous handle", async () => {
		const payload = seed({
			shops: [
				{
					id: "shops-90",
					handle: "new",
					status: "active",
					previousHandles: [{ handle: "akwatech", until: inDays(10) }],
				},
			],
		});
		expect(
			await checkHandleAvailability(payload, "akwatech", { now: NOW }),
		).toMatchObject({
			available: false,
			reason: "taken",
		});
	});

	it("frees an expired previous handle", async () => {
		const payload = seed({
			shops: [
				{
					id: "shops-90",
					handle: "new",
					status: "active",
					previousHandles: [{ handle: "akwatech", until: daysAgo(1) }],
				},
			],
		});
		expect(
			await checkHandleAvailability(payload, "akwatech", { now: NOW }),
		).toMatchObject({ available: true });
	});

	it("lets a shop take back its own previous handle", async () => {
		const payload = seed({
			shops: [
				{
					id: "shops-90",
					handle: "new",
					status: "active",
					previousHandles: [{ handle: "akwatech", until: inDays(10) }],
				},
			],
		});
		expect(
			await checkHandleAvailability(payload, "akwatech", {
				now: NOW,
				excludeShopId: "shops-90",
			}),
		).toMatchObject({ available: true });
	});

	it("holds a closed shop's handle for 90 days, then releases it", async () => {
		const recent = seed({
			shops: [
				{
					id: "shops-90",
					handle: "akwatech",
					status: "closed",
					closedAt: daysAgo(10),
				},
			],
		});
		expect(
			await checkHandleAvailability(recent, "akwatech", { now: NOW }),
		).toMatchObject({
			available: false,
			reason: "taken",
		});
		const old = seed({
			shops: [
				{
					id: "shops-90",
					handle: "akwatech",
					status: "closed",
					closedAt: daysAgo(91),
				},
			],
		});
		expect(
			await checkHandleAvailability(old, "akwatech", { now: NOW }),
		).toMatchObject({ available: true });
	});

	it("renames the released closed shop when the handle is reused", async () => {
		const payload = seed({
			shops: [
				{
					id: "shops-90",
					handle: "akwatech",
					owner: "u-9",
					status: "closed",
					closedAt: daysAgo(91),
				},
			],
		});
		await createShop(payload, U1, { handle: "akwatech", name: "Akwa" }, NOW);
		expect(payload.store.shops.find((s) => s.id === "shops-90")?.handle).toBe(
			"xshops-90",
		);
	});
});
