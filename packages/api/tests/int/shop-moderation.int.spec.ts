import { describe, expect, it, vi } from "vitest";
import {
	liftExpiredShopSuspensions,
	suspendShop,
	suspendUser,
	unsuspendShop,
	unsuspendUser,
} from "../../src/services/moderation";
import { fakePayload } from "./helpers/fakePayload";

const MOD = { id: "mod-1", role: "moderator" };
const ADMIN = { id: "admin-1", role: "admin" };

function seed() {
	return fakePayload({
		users: [
			{ id: "u-1", role: "user", name: "Aïcha" },
			{ id: "mod-1", role: "moderator", name: "Grâce" },
			{ id: "mod-2", role: "moderator", name: "Colleague" },
			{ id: "admin-1", role: "admin", name: "Boss" },
		],
		shops: [
			{
				id: "s-1",
				handle: "akwatech",
				name: "Akwa",
				owner: "u-1",
				status: "active",
			},
			{
				id: "s-2",
				handle: "modshop",
				name: "Mod shop",
				owner: "mod-2",
				status: "active",
			},
			{
				id: "s-3",
				handle: "mine",
				name: "Mine",
				owner: "mod-1",
				status: "active",
			},
		],
		listings: [
			{ id: "l-1", shop: "s-1", seller: "u-1", status: "published" },
			{ id: "l-2", shop: "s-1", seller: "u-1", status: "published" },
			{ id: "l-3", shop: "s-1", seller: "u-1", status: "pending" },
			{ id: "l-4", shop: null, seller: "u-1", status: "published" },
		],
		"moderation-log": [],
	});
}

const shop = (p: ReturnType<typeof seed>, id = "s-1") =>
	p.store.shops.find((s) => s.id === id);
const listing = (p: ReturnType<typeof seed>, id: string) =>
	p.store.listings.find((l) => l.id === id);

describe("suspendShop", () => {
	it("takes the shop's published listings down and records them", async () => {
		const payload = seed();
		const result = await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
			note: "Contrefaçons",
		});

		expect(result.unpublishedListingIds.sort()).toEqual(["l-1", "l-2"]);
		expect(listing(payload, "l-3")?.status).toBe("pending");
		expect(listing(payload, "l-4")?.status).toBe("published");
		expect(shop(payload)).toMatchObject({
			status: "suspended",
			suspendedReason: "fraud",
			suspendedNote: "Contrefaçons",
			suspendedBy: "mod-1",
		});
		expect(payload.store["moderation-log"][0]).toMatchObject({
			action: "shop.suspend",
			targetType: "shop",
			targetId: "s-1",
			reason: "fraud",
		});
	});

	it("compares ranks through the owner", async () => {
		await expect(
			suspendShop(seed(), MOD, "s-2", { reason: "spam", durationDays: 7 }),
		).rejects.toMatchObject({ code: "moderation.rankTooLow", status: 403 });
		await expect(
			suspendShop(seed(), ADMIN, "s-2", { reason: "spam", durationDays: 7 }),
		).resolves.toMatchObject({ shopId: "s-2" });
	});

	it("refuses a moderator's own shop", async () => {
		await expect(
			suspendShop(seed(), MOD, "s-3", { reason: "spam", durationDays: 7 }),
		).rejects.toMatchObject({ code: "moderation.rankTooLow" });
	});

	it("refuses a shop that is not active", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", { reason: "spam", durationDays: 7 });
		await expect(
			suspendShop(payload, MOD, "s-1", { reason: "spam", durationDays: 7 }),
		).rejects.toMatchObject({
			code: "moderation.invalidTransition",
			status: 409,
		});
	});
});

describe("unsuspendShop", () => {
	it("restores listings still in draft only", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		listing(payload, "l-2")!.status = "sold";

		const result = await unsuspendShop(payload, MOD, "s-1", {
			note: "Justificatifs reçus",
		});
		expect(result.restoredListingIds).toEqual(["l-1"]);
		expect(listing(payload, "l-1")?.status).toBe("published");
		expect(shop(payload)).toMatchObject({
			status: "active",
			suspendedAt: null,
			suspendedReason: null,
		});
		expect(payload.store["moderation-log"].at(-1)).toMatchObject({
			action: "shop.unsuspend",
		});
	});

	it("can leave the listings down", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		expect(
			(await unsuspendShop(payload, MOD, "s-1", { restoreListings: false }))
				.restoredListingIds,
		).toEqual([]);
		expect(listing(payload, "l-1")?.status).toBe("draft");
	});

	it("refuses an active shop", async () => {
		await expect(unsuspendShop(seed(), MOD, "s-1")).rejects.toMatchObject({
			code: "moderation.invalidTransition",
		});
	});
});

describe("user suspension cascade", () => {
	it("suspends the user's active shops and lifts only those", async () => {
		const payload = seed();
		payload.store.shops.push({
			id: "s-4",
			handle: "second",
			name: "Second",
			owner: "u-1",
			status: "active",
		});
		await suspendUser(payload, MOD, "u-1", {
			reason: "fraud",
			durationDays: 7,
		});

		expect(shop(payload, "s-1")?.status).toBe("suspended");
		expect(shop(payload, "s-4")?.status).toBe("suspended");
		expect(
			payload.store["moderation-log"].at(-1)?.metadata.suspendedShopIds.sort(),
		).toEqual(["s-1", "s-4"]);

		await unsuspendShop(payload, MOD, "s-4");
		await suspendShop(payload, MOD, "s-4", { reason: "spam", durationDays: 7 });

		const result = await unsuspendUser(payload, MOD, "u-1");
		expect(result.restoredShopIds).toEqual(["s-1"]);
		expect(shop(payload, "s-1")?.status).toBe("active");
		expect(shop(payload, "s-4")?.status).toBe("suspended");
	});
});

describe("liftExpiredShopSuspensions", () => {
	it("lifts lapsed suspensions, restores listings and logs a system entry", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", { reason: "spam", durationDays: 1 });
		const later = new Date(Date.now() + 2 * 86_400_000);

		expect(await liftExpiredShopSuspensions(payload, later)).toEqual({
			lifted: ["s-1"],
		});
		expect(shop(payload)?.status).toBe("active");
		expect(listing(payload, "l-1")?.status).toBe("published");
		expect(payload.store["moderation-log"].at(-1)).toMatchObject({
			action: "shop.unsuspend",
			actorRole: "system",
			actor: "mod-1",
			metadata: { expired: true },
		});
	});

	it("leaves running suspensions alone", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", { reason: "spam", durationDays: 7 });
		expect(await liftExpiredShopSuspensions(payload, new Date())).toEqual({
			lifted: [],
		});
	});
});

describe("POST /api/moderation/shops/{id}", () => {
	it("refuses a moderator acting on a shop owned by another moderator", async () => {
		const payload = seed();
		Object.assign(payload, {
			auth: async () => ({ user: { id: "mod-1", role: "moderator" } }),
		});
		vi.resetModules();
		vi.doMock("@payload-config", () => ({ default: {} }));
		vi.doMock("payload", async (importOriginal) => ({
			...(await importOriginal<typeof import("payload")>()),
			getPayload: async () => payload,
		}));
		const { POST } = await import(
			"../../src/app/(frontend)/api/moderation/shops/[id]/route"
		);

		const res = await POST(
			new Request("http://x", {
				method: "POST",
				body: JSON.stringify({
					action: "suspend",
					reason: "spam",
					durationDays: 7,
				}),
			}),
			{ params: Promise.resolve({ id: "s-2" }) },
		);
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ code: "moderation.rankTooLow" });
	});
});
