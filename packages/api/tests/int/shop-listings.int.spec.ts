// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/validation", () => ({
	validateListingAttributes: vi.fn(async () => []),
}));

import {
	attachListings,
	closeOwnedShops,
	closeShop,
	detachListings,
} from "../../src/services/shopListings";
import { fakePayload } from "./helpers/fakePayload";

const U1 = { id: "u-1" };
const NOW = new Date("2026-09-15T12:00:00.000Z");

function seed() {
	return fakePayload(
		{
			users: [
				{ id: "u-1", name: "Aïcha" },
				{ id: "u-2", name: "Other" },
			],
			categories: [{ id: "cat-1", name: "Téléphones" }],
			shops: [
				{
					id: "s-1",
					handle: "akwatech",
					status: "active",
					owner: "u-1",
					location: { city: "Douala" },
				},
				{ id: "s-2", handle: "other", status: "active", owner: "u-2" },
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
			],
			listings: [
				{
					id: "l-1",
					title: "iPhone 12 128 Go",
					description: "Batterie 88 %",
					price: 195000,
					category: "cat-1",
					condition: "good",
					attributes: {},
					images: [{ image: "m-1" }],
					status: "published",
					seller: "u-1",
					shop: null,
					product: null,
					location: "Douala",
					expiresAt: "2026-10-01T00:00:00.000Z",
				},
				{
					id: "l-2",
					title: "Chargeur MagSafe",
					description: "",
					price: 22000,
					category: "cat-1",
					images: [],
					status: "pending",
					seller: "u-1",
					shop: null,
					product: null,
					location: "Douala",
				},
				{
					id: "l-3",
					title: "Casque JBL",
					price: 28000,
					category: "cat-1",
					images: [],
					status: "sold",
					seller: "u-1",
					shop: null,
					product: null,
					location: "Douala",
				},
				{
					id: "l-4",
					title: "Not mine",
					price: 1,
					category: "cat-1",
					images: [],
					status: "published",
					seller: "u-2",
					shop: null,
					product: null,
					location: "Douala",
				},
				{
					id: "l-5",
					title: "Elsewhere",
					price: 1,
					category: "cat-1",
					images: [],
					status: "published",
					seller: "u-1",
					shop: "s-2",
					product: null,
					location: "Douala",
				},
			],
			products: [],
			"product-variants": [],
			"stock-movements": [],
		},
		{
			// The partial unique index migration 20260923_000000_p1_product_listing
			// builds: one product per listing, and any number without one.
			uniques: { products: [["listing"]] },
		},
	);
}

describe("attachListings", () => {
	it("turns the caller's listings into products with one untracked variant", async () => {
		const payload = seed();
		const result = await attachListings(payload, U1, "s-1", {
			listingIds: ["l-1", "l-2", "l-3", "l-4", "l-5"],
		});

		expect(result.attached.map((a) => a.listingId)).toEqual(["l-1", "l-2"]);
		expect(result.skipped).toEqual([
			{ listingId: "l-3", reason: "status" },
			{ listingId: "l-4", reason: "notOwner" },
			{ listingId: "l-5", reason: "otherShop" },
		]);

		const l1 = payload.store.listings.find((l) => l.id === "l-1");
		expect(l1).toMatchObject({
			id: "l-1",
			shop: "s-1",
			status: "published",
			expiresAt: null,
			product: result.attached[0].productId,
		});
		expect(payload.store.listings.find((l) => l.id === "l-2")?.status).toBe(
			"pending",
		);
		expect(payload.store["product-variants"][0]).toMatchObject({
			optionValues: {},
			price: 195000,
			trackInventory: false,
			stockOnHand: 0,
		});
		expect(payload.store.products[0]).toMatchObject({
			title: "iPhone 12 128 Go",
			status: "active",
			listing: "l-1",
		});
	});

	it("attaches everything the caller owns with all: true", async () => {
		const result = await attachListings(seed(), U1, "s-1", { all: true });
		expect(result.attached.map((a) => a.listingId).sort()).toEqual([
			"l-1",
			"l-2",
		]);
	});

	it("refuses a non-member", async () => {
		await expect(
			attachListings(seed(), { id: "u-2" }, "s-1", { all: true }),
		).rejects.toMatchObject({ code: "shop.notMember" });
	});

	it("does not create two products for two concurrent attaches of the same listing", async () => {
		const payload = seed();
		const [first, second] = await Promise.all([
			attachListings(payload, U1, "s-1", { listingIds: ["l-1"] }),
			attachListings(payload, U1, "s-1", { listingIds: ["l-1"] }),
		]);

		const winner = [first, second].find((r) => r.attached.length > 0);
		const loser = [first, second].find((r) => r.skipped.length > 0);
		expect(winner?.attached).toHaveLength(1);
		expect(loser?.skipped).toEqual([
			{ listingId: "l-1", reason: "alreadyAttached" },
		]);

		expect(payload.store.products).toHaveLength(1);
		expect(payload.store.listings.find((l) => l.id === "l-1")?.product).toBe(
			winner?.attached[0].productId,
		);
	});
});

describe("detachListings", () => {
	it("returns a listing to a classified ad and archives its product", async () => {
		const payload = seed();
		await attachListings(payload, U1, "s-1", { listingIds: ["l-1"] });
		const result = await detachListings(payload, U1, "s-1", {
			listingIds: ["l-1", "l-4"],
		});

		expect(result.detached).toEqual(["l-1"]);
		const l1 = payload.store.listings.find((l) => l.id === "l-1");
		expect(l1).toMatchObject({
			shop: null,
			product: null,
			productSummary: null,
			status: "published",
		});
		expect(l1?.expiresAt).toBeTruthy();
		expect(payload.store.products[0]).toMatchObject({
			status: "archived",
			listing: null,
		});
	});

	// `writable: true` is what makes `requireShopMember` run
	// `assertNotSuspended` and check the shop's own status — the same guard
	// `attachListings` already carries. Without it, detaching moved listings
	// out from under a suspended shop's restore set, and out from under a
	// suspended account's own moderation review.
	it("refuses to detach from a suspended shop", async () => {
		const payload = seed();
		await attachListings(payload, U1, "s-1", { listingIds: ["l-1"] });
		payload.store.shops[0].status = "suspended";
		await expect(
			detachListings(payload, U1, "s-1", { listingIds: ["l-1"] }),
		).rejects.toMatchObject({ code: "shop.inactive", status: 409 });
	});

	it("refuses a caller whose own account is suspended", async () => {
		const payload = seed();
		await attachListings(payload, U1, "s-1", { listingIds: ["l-1"] });
		const suspendedCaller = {
			id: "u-1",
			suspendedAt: "2026-01-01T00:00:00.000Z",
			suspendedUntil: "2099-01-01T00:00:00.000Z",
		};
		await expect(
			detachListings(payload, suspendedCaller, "s-1", { listingIds: ["l-1"] }),
		).rejects.toMatchObject({ data: { code: "moderation.accountSuspended" } });
	});
});

describe("closeShop", () => {
	it("requires the handle as confirmation", async () => {
		await expect(
			closeShop(seed(), U1, "s-1", { confirmation: "wrong" }, NOW),
		).rejects.toMatchObject({ code: "generic.validation" });
	});

	it("closes, detaches every listing and archives products", async () => {
		const payload = seed();
		await attachListings(payload, U1, "s-1", { listingIds: ["l-1"] });
		const result = await closeShop(
			payload,
			U1,
			"s-1",
			{ confirmation: "@AkwaTech" },
			NOW,
		);

		expect(result).toEqual({ closed: true, detachedListingIds: ["l-1"] });
		expect(payload.store.shops[0]).toMatchObject({
			status: "closed",
			closedAt: NOW.toISOString(),
		});
		expect(payload.store.listings.find((l) => l.id === "l-1")?.shop).toBeNull();
		expect(payload.store.products.every((p) => p.status === "archived")).toBe(
			true,
		);
	});

	it("is owner-only", async () => {
		const payload = seed();
		payload.store["shop-members"].push({
			id: "m-3",
			shop: "s-1",
			user: "u-2",
			role: "manager",
			status: "active",
		});
		await expect(
			closeShop(
				payload,
				{ id: "u-2" },
				"s-1",
				{ confirmation: "akwatech" },
				NOW,
			),
		).rejects.toMatchObject({ code: "shop.notMember" });
	});
});

describe("closeOwnedShops", () => {
	it("closes every open shop the user owns", async () => {
		const payload = seed();
		expect(await closeOwnedShops(payload, "u-1", NOW)).toEqual(["s-1"]);
		expect(payload.store.shops.find((s) => s.id === "s-2")?.status).toBe(
			"active",
		);
	});
});
