import { describe, expect, it, vi } from "vitest";
import { Listings } from "../../src/collections/Listings";
import {
	approveListing,
	clearListingHold,
	liftExpiredShopSuspensions,
	suspendShop,
	suspendUser,
	unsuspendShop,
	unsuspendUser,
} from "../../src/services/moderation";
import { syncProductListing } from "../../src/services/products";
import {
	attachListings,
	closeShop,
	detachListings,
} from "../../src/services/shopListings";
import { recordMovement } from "../../src/services/stock";
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

	it("re-checks the status inside the transaction, so two concurrent suspends cannot both win", async () => {
		const payload = seed();
		const originalFindByID = payload.findByID.bind(payload);
		let intercepted = false;
		payload.findByID = (async (
			args: Parameters<typeof originalFindByID>[0],
		) => {
			const req = (args as { req?: { transactionID?: string } }).req;
			if (
				!intercepted &&
				args.collection === "shops" &&
				String(args.id) === "s-1" &&
				req?.transactionID
			) {
				intercepted = true;
				// A concurrent suspend that reads the shop as active before this
				// one opened its transaction, then wins the race and commits first.
				await suspendShop(payload, ADMIN, "s-1", {
					reason: "prohibited",
					durationDays: 3,
				});
			}
			return originalFindByID(args);
		}) as typeof originalFindByID;

		await expect(
			suspendShop(payload, MOD, "s-1", { reason: "fraud", durationDays: 7 }),
		).rejects.toMatchObject({
			code: "moderation.invalidTransition",
			status: 409,
		});

		// The winner's own record stands, untouched by the loser.
		expect(shop(payload, "s-1")).toMatchObject({
			status: "suspended",
			suspendedReason: "prohibited",
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
		expect(listing(payload, "l-1")?.moderationHold).toBe(false);
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
		expect(listing(payload, "l-1")?.moderationHold).toBe(true);
	});

	it("refuses an active shop", async () => {
		await expect(unsuspendShop(seed(), MOD, "s-1")).rejects.toMatchObject({
			code: "moderation.invalidTransition",
		});
	});

	it("does not restore a listing that has since moved to a different shop", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		listing(payload, "l-1")!.shop = "s-2";

		const result = await unsuspendShop(payload, MOD, "s-1");
		expect(result.restoredListingIds).toEqual(["l-2"]);
		expect(listing(payload, "l-1")?.status).toBe("draft");
		expect(listing(payload, "l-1")?.shop).toBe("s-2");
	});

	it("does not republish a listing that was rejected while the shop was suspended", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		listing(payload, "l-1")!.status = "rejected";

		const result = await unsuspendShop(payload, MOD, "s-1");
		expect(result.restoredListingIds).toEqual(["l-2"]);
		expect(listing(payload, "l-1")?.status).toBe("rejected");
	});

	it("does not resurrect listings deliberately left down once a later suspension expires via the job", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		await unsuspendShop(payload, MOD, "s-1", { restoreListings: false });
		// Nothing published is left to take down this time.
		await suspendShop(payload, MOD, "s-1", { reason: "spam", durationDays: 1 });
		const later = new Date(Date.now() + 2 * 86_400_000);

		expect(await liftExpiredShopSuspensions(payload, later)).toEqual({
			lifted: ["s-1"],
		});
		expect(shop(payload, "s-1")?.status).toBe("active");
		expect(listing(payload, "l-1")?.status).toBe("draft");
		expect(listing(payload, "l-2")?.status).toBe("draft");
	});
});

describe("a moderator's hold survives an ordinary seller action", () => {
	const SELLER = { id: "u-1" };

	function seedProductBacked() {
		return fakePayload({
			users: [
				{ id: "u-1", role: "user", name: "Aïcha" },
				{ id: "mod-1", role: "moderator", name: "Grâce" },
			],
			categories: [{ id: "cat-1", name: "Audio" }],
			shops: [
				{
					id: "s-1",
					handle: "akwatech",
					name: "Akwa",
					owner: "u-1",
					status: "active",
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
			],
			products: [
				{
					id: "p-1",
					shop: "s-1",
					title: "AirPods Pro",
					category: "cat-1",
					status: "active",
					listing: "l-1",
				},
			],
			"product-variants": [
				{
					id: "v-1",
					product: "p-1",
					shop: "s-1",
					optionValues: {},
					price: 95000,
					trackInventory: true,
					stockOnHand: 5,
					stockReserved: 0,
					archivedAt: null,
				},
			],
			listings: [
				{
					id: "l-1",
					shop: "s-1",
					product: "p-1",
					seller: "u-1",
					title: "AirPods Pro",
					description: "d",
					price: 95000,
					category: "cat-1",
					attributes: {},
					images: [],
					location: "Douala",
					status: "published",
					moderationHold: false,
					productSummary: {
						priceMin: 95000,
						priceMax: 95000,
						available: true,
						variantCount: 1,
						trackInventory: true,
					},
				},
			],
			"stock-movements": [],
			"moderation-log": [],
		});
	}

	const listing = (p: ReturnType<typeof seedProductBacked>, id: string) =>
		p.store.listings.find((l) => l.id === id);

	// The exact defect: `unsuspendShop({ restoreListings: false })` leaves the
	// listing deliberately drafted, but `recordMovement` calls
	// `syncProductListing(..., { create: false })` on every stock movement —
	// before this fix that unconditionally republished the listing the
	// moderator chose to leave down, with nothing written to the log.
	it("is not undone by the seller's next stock movement", async () => {
		const payload = seedProductBacked();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		expect(listing(payload, "l-1")?.status).toBe("draft");
		expect(listing(payload, "l-1")?.moderationHold).toBe(true);

		await unsuspendShop(payload, MOD, "s-1", { restoreListings: false });
		const logLengthBeforeMovement = payload.store["moderation-log"].length;

		await recordMovement(payload, SELLER, "v-1", {
			type: "receipt",
			quantity: 3,
		});

		expect(listing(payload, "l-1")?.status).toBe("draft");
		expect(listing(payload, "l-1")?.moderationHold).toBe(true);
		expect(payload.store["moderation-log"]).toHaveLength(
			logLengthBeforeMovement,
		);
	});

	// The earlier ruling's case, still open: a listing the seller themselves
	// drafted (never touched by moderation) still republishes once the product
	// goes active again — a normal sync, not a moderator's decision, put it
	// down.
	it("still republishes a listing the seller drafted themselves", async () => {
		const payload = seedProductBacked();
		listing(payload, "l-1")!.status = "draft";
		listing(payload, "l-1")!.moderationHold = false;

		const req = { payload, user: SELLER, context: {} } as never;
		await syncProductListing(req, "p-1", { create: false });

		expect(listing(payload, "l-1")?.status).toBe("published");
	});

	const listingsBeforeChange = Listings.hooks?.beforeChange?.[0] as (
		args: unknown,
	) => Promise<Record<string, unknown>>;

	// Round 2's escape: detaching a held listing clears `product`, which took
	// it out of the branch that pins `status`/`moderationHold` — two ordinary
	// calls (detach, then a direct PATCH) used to be enough to undo the
	// moderator's decision with nothing written to the log.
	it("cannot be lifted by detaching the held listing, then patching it directly", async () => {
		const payload = seedProductBacked();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		await unsuspendShop(payload, MOD, "s-1", { restoreListings: false });
		expect(listing(payload, "l-1")?.status).toBe("draft");
		expect(listing(payload, "l-1")?.moderationHold).toBe(true);

		// Call 1: the seller detaches their own held listing — `writable`
		// passes, the shop is active again after unsuspend.
		await detachListings(payload, SELLER, "s-1", { listingIds: ["l-1"] });
		const afterDetach = listing(payload, "l-1")!;
		expect(afterDetach.product).toBeNull();
		expect(afterDetach.status).toBe("draft");
		expect(afterDetach.moderationHold).toBe(true);

		// Call 2: a direct PATCH through the collection. The listing is now a
		// plain classified ad the seller owns outright — isOwnerOrAdmin alone
		// would let this straight through without the beforeChange pin.
		const result = await listingsBeforeChange({
			operation: "update",
			originalDoc: afterDetach,
			data: { ...afterDetach, status: "published", moderationHold: false },
			req: { payload, user: SELLER, context: {} },
		});

		expect(result.status).toBe("draft");
		expect(result.moderationHold).toBe(true);
	});

	// The same escape, reached through closeShop instead of detachListings
	// directly — closeShopInTransaction detaches every listing the same way.
	it("cannot be lifted by closing the shop, then patching the detached listing directly", async () => {
		const payload = seedProductBacked();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		await unsuspendShop(payload, MOD, "s-1", { restoreListings: false });

		await closeShop(payload, SELLER, "s-1", { confirmation: "akwatech" });
		const afterClose = listing(payload, "l-1")!;
		expect(afterClose.product).toBeNull();
		expect(afterClose.status).toBe("draft");
		expect(afterClose.moderationHold).toBe(true);

		const result = await listingsBeforeChange({
			operation: "update",
			originalDoc: afterClose,
			data: { ...afterClose, status: "published", moderationHold: false },
			req: { payload, user: SELLER, context: {} },
		});

		expect(result.status).toBe("draft");
		expect(result.moderationHold).toBe(true);
	});

	// attach is the mirror path: does re-attaching a held, detached listing to
	// a (possibly different) product/shop revive it without the hold? No —
	// `attachOne` never touches `moderationHold`, and the moment the listing
	// carries a product again it falls back under the PRODUCT_DERIVED_FIELDS
	// pin, which already protects `status`/`moderationHold` unconditionally.
	it("is not revived by re-attaching the detached listing to a new product", async () => {
		const payload = seedProductBacked();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		await unsuspendShop(payload, MOD, "s-1", { restoreListings: false });
		await detachListings(payload, SELLER, "s-1", { listingIds: ["l-1"] });

		const result = await attachListings(payload, SELLER, "s-1", {
			listingIds: ["l-1"],
		});
		expect(result.attached).toHaveLength(1);

		const afterAttach = listing(payload, "l-1")!;
		expect(afterAttach.status).toBe("draft");
		expect(afterAttach.moderationHold).toBe(true);

		// And a direct PATCH is blocked again too, now via the product branch.
		const patched = await listingsBeforeChange({
			operation: "update",
			originalDoc: afterAttach,
			data: { ...afterAttach, status: "published", moderationHold: false },
			req: { payload, user: SELLER, context: {} },
		});
		expect(patched.status).toBe("draft");
		expect(patched.moderationHold).toBe(true);
	});
});

// N1/N4: the pin that closed the round-2 escape must not turn into a
// permanent freeze — a held listing (detached or not) always has a way
// back. For a detached listing, that means the seller's own next edit
// decides. A listing still attached to a product has no such edit to make:
// `clearListingHold` moves it to "pending" instead, so an ordinary sync
// (a stock movement, a product edit) still cannot republish it, and only an
// explicit, logged `approveListing` can.
describe("a moderator's hold is never a one-way door", () => {
	const SELLER = { id: "u-1" };

	function seedProductBacked() {
		return fakePayload({
			users: [
				{ id: "u-1", role: "user", name: "Aïcha" },
				{ id: "mod-1", role: "moderator", name: "Grâce" },
			],
			categories: [{ id: "cat-1", name: "Audio" }],
			shops: [
				{
					id: "s-1",
					handle: "akwatech",
					name: "Akwa",
					owner: "u-1",
					status: "active",
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
			],
			products: [
				{
					id: "p-1",
					shop: "s-1",
					title: "AirPods Pro",
					category: "cat-1",
					status: "active",
					listing: "l-1",
				},
			],
			"product-variants": [
				{
					id: "v-1",
					product: "p-1",
					shop: "s-1",
					optionValues: {},
					price: 95000,
					trackInventory: true,
					stockOnHand: 5,
					stockReserved: 0,
					archivedAt: null,
				},
			],
			listings: [
				{
					id: "l-1",
					shop: "s-1",
					product: "p-1",
					seller: "u-1",
					title: "AirPods Pro",
					description: "d",
					price: 95000,
					category: "cat-1",
					attributes: {},
					images: [],
					location: "Douala",
					status: "published",
					moderationHold: false,
					productSummary: {
						priceMin: 95000,
						priceMax: 95000,
						available: true,
						variantCount: 1,
						trackInventory: true,
					},
				},
			],
			"stock-movements": [],
			"moderation-log": [],
		});
	}

	const listing = (p: ReturnType<typeof seedProductBacked>, id: string) =>
		p.store.listings.find((l) => l.id === id);

	const listingsBeforeChange = Listings.hooks?.beforeChange?.[0] as (
		args: unknown,
	) => Promise<Record<string, unknown>>;

	it("a moderator can release a held, detached listing directly", async () => {
		const payload = seedProductBacked();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		await unsuspendShop(payload, MOD, "s-1", { restoreListings: false });
		await detachListings(payload, SELLER, "s-1", { listingIds: ["l-1"] });
		expect(listing(payload, "l-1")?.moderationHold).toBe(true);

		await clearListingHold(payload, MOD, "l-1");
		const released = listing(payload, "l-1")!;
		expect(released.moderationHold).toBe(false);
		// The direct clear only lifts the hold; it does not itself decide the
		// listing's status — the seller does, next.
		expect(released.status).toBe("draft");

		const result = await listingsBeforeChange({
			operation: "update",
			originalDoc: released,
			data: { ...released, status: "sold" },
			req: { payload, user: SELLER, context: {} },
		});
		expect(result.status).toBe("sold");
	});

	// N4: clearing the flag alone is not enough here — the listing is still
	// attached to "p-1", so the very next sync (`recordMovement` calls
	// `syncProductListing(..., { create: false })`) would otherwise republish
	// it silently, with nothing written to the log.
	it("a moderator's release of an attached listing does not come back on the seller's next stock movement", async () => {
		const payload = seedProductBacked();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		await unsuspendShop(payload, MOD, "s-1", { restoreListings: false });
		expect(listing(payload, "l-1")?.moderationHold).toBe(true);
		expect(listing(payload, "l-1")?.status).toBe("draft");

		await clearListingHold(payload, MOD, "l-1");
		const released = listing(payload, "l-1")!;
		expect(released.moderationHold).toBe(false);
		expect(released.status).toBe("pending");

		await recordMovement(payload, SELLER, "v-1", {
			type: "receipt",
			quantity: 1,
		});
		expect(listing(payload, "l-1")?.status).toBe("pending");

		// Only an explicit, logged moderator decision puts it back on sale.
		await approveListing(payload, MOD, "l-1");
		expect(listing(payload, "l-1")?.status).toBe("published");
	});

	it("approving a held listing lets the seller move its status afterwards", async () => {
		const payload = seedProductBacked();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		await unsuspendShop(payload, MOD, "s-1", { restoreListings: false });
		await detachListings(payload, SELLER, "s-1", { listingIds: ["l-1"] });

		await approveListing(payload, MOD, "l-1");
		const approved = listing(payload, "l-1")!;
		expect(approved.status).toBe("published");
		expect(approved.moderationHold).toBe(false);

		// Before this fix, this write was silently reverted back to
		// "published" forever — the hold outlived the decision it recorded.
		const result = await listingsBeforeChange({
			operation: "update",
			originalDoc: approved,
			data: { ...approved, status: "sold" },
			req: { payload, user: SELLER, context: {} },
		});
		expect(result.status).toBe("sold");
	});

	it("refuses to clear a hold from a plain user", async () => {
		const payload = seedProductBacked();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		await expect(
			clearListingHold(payload, { id: "u-9", role: "user" }, "l-1"),
		).rejects.toMatchObject({ code: "moderation.forbidden" });
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

	it("falls back to the user's suspendedAt when a cascaded shop is missing its suspensionLogId, and logs loudly", async () => {
		const payload = seed();
		await suspendUser(payload, MOD, "u-1", {
			reason: "fraud",
			durationDays: 7,
		});
		// Should never happen through this service, but must not silently strand
		// the shop suspended if it ever does.
		shop(payload, "s-1")!.suspensionLogId = null;

		const result = await unsuspendUser(payload, MOD, "u-1");
		expect(result.restoredShopIds).toEqual(["s-1"]);
		expect(shop(payload, "s-1")?.status).toBe("active");
		expect(payload.logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ shopId: "s-1", currentSuspensionLogId: null }),
			expect.any(String),
		);
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

	it("does not fight a moderator who unsuspended in the window between the candidate read and the transaction", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", { reason: "spam", durationDays: 1 });
		const later = new Date(Date.now() + 2 * 86_400_000);

		const originalFindByID = payload.findByID.bind(payload);
		let intercepted = false;
		payload.findByID = (async (
			args: Parameters<typeof originalFindByID>[0],
		) => {
			const req = (args as { req?: { transactionID?: string } }).req;
			if (
				!intercepted &&
				args.collection === "shops" &&
				String(args.id) === "s-1" &&
				req?.transactionID
			) {
				intercepted = true;
				// Lands exactly in the job's re-read window, inside its own
				// transaction: a moderator deliberately leaves the listings down.
				await unsuspendShop(payload, MOD, "s-1", { restoreListings: false });
			}
			return originalFindByID(args);
		}) as typeof originalFindByID;

		expect(await liftExpiredShopSuspensions(payload, later)).toEqual({
			lifted: [],
		});
		expect(shop(payload, "s-1")?.status).toBe("active");
		expect(listing(payload, "l-1")?.status).toBe("draft");
		const shopEntries = payload.store["moderation-log"].filter(
			(entry) => entry.action === "shop.unsuspend" && entry.targetId === "s-1",
		);
		expect(shopEntries).toHaveLength(1);
		expect(shopEntries[0]).toMatchObject({ actorRole: "moderator" });
	});

	it("does not double-lift across two overlapping runs", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", { reason: "spam", durationDays: 1 });
		const later = new Date(Date.now() + 2 * 86_400_000);

		const originalFindByID = payload.findByID.bind(payload);
		let intercepted = false;
		payload.findByID = (async (
			args: Parameters<typeof originalFindByID>[0],
		) => {
			const req = (args as { req?: { transactionID?: string } }).req;
			if (
				!intercepted &&
				args.collection === "shops" &&
				String(args.id) === "s-1" &&
				req?.transactionID
			) {
				intercepted = true;
				// A second, overlapping run of the very same job lifts the shop
				// first, inside the window between this run's candidate read and
				// this run's own transaction.
				await liftExpiredShopSuspensions(payload, later);
			}
			return originalFindByID(args);
		}) as typeof originalFindByID;

		const first = await liftExpiredShopSuspensions(payload, later);
		expect(first).toEqual({ lifted: [] });
		expect(shop(payload, "s-1")?.status).toBe("active");
		const shopEntries = payload.store["moderation-log"].filter(
			(entry) => entry.action === "shop.unsuspend" && entry.targetId === "s-1",
		);
		expect(shopEntries).toHaveLength(1);
	});

	it("skips a suspended shop with no suspendedBy instead of lifting it unlogged", async () => {
		const payload = seed();
		const past = new Date(Date.now() - 86_400_000).toISOString();
		payload.store["moderation-log"].push({
			id: "log-orphan",
			action: "shop.suspend",
			targetType: "shop",
			targetId: "s-1",
			actor: "mod-1",
			actorRole: "moderator",
			metadata: { unpublishedListingIds: [] },
			createdAt: past,
		});
		Object.assign(shop(payload, "s-1")!, {
			status: "suspended",
			suspendedAt: past,
			suspendedUntil: past,
			suspendedReason: "spam",
			suspendedBy: null,
			suspensionLogId: "log-orphan",
		});

		const result = await liftExpiredShopSuspensions(payload, new Date());
		expect(result).toEqual({ lifted: [] });
		expect(shop(payload, "s-1")?.status).toBe("suspended");
		expect(
			payload.store["moderation-log"].some(
				(entry) =>
					entry.action === "shop.unsuspend" && entry.targetId === "s-1",
			),
		).toBe(false);
		expect(payload.logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ shopId: "s-1" }),
			expect.any(String),
		);
	});

	it('skips a shop that was independently re-suspended inside the race window, even though it is still "suspended"', async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", { reason: "spam", durationDays: 1 });
		const later = new Date(Date.now() + 2 * 86_400_000);

		const originalFindByID = payload.findByID.bind(payload);
		let intercepted = false;
		payload.findByID = (async (
			args: Parameters<typeof originalFindByID>[0],
		) => {
			const req = (args as { req?: { transactionID?: string } }).req;
			if (
				!intercepted &&
				args.collection === "shops" &&
				String(args.id) === "s-1" &&
				req?.transactionID
			) {
				intercepted = true;
				// Status ends up "suspended" again, but under a different
				// suspension entirely — the status re-check alone cannot catch
				// this, only the identity match can.
				await unsuspendShop(payload, MOD, "s-1");
				await suspendShop(payload, ADMIN, "s-1", {
					reason: "prohibited",
					durationDays: 3,
				});
			}
			return originalFindByID(args);
		}) as typeof originalFindByID;

		expect(await liftExpiredShopSuspensions(payload, later)).toEqual({
			lifted: [],
		});
		expect(shop(payload, "s-1")).toMatchObject({
			status: "suspended",
			suspendedReason: "prohibited",
		});
	});

	it("falls back to suspendedAt and lifts when suspensionLogId is unexpectedly null, logging loudly", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", { reason: "spam", durationDays: 1 });
		// Should never happen through this service (no row predates the field),
		// but must not silently strand the shop suspended if it ever does.
		shop(payload, "s-1")!.suspensionLogId = null;
		const later = new Date(Date.now() + 2 * 86_400_000);

		expect(await liftExpiredShopSuspensions(payload, later)).toEqual({
			lifted: ["s-1"],
		});
		expect(shop(payload, "s-1")?.status).toBe("active");
		expect(listing(payload, "l-1")?.status).toBe("published");
		expect(payload.logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ shopId: "s-1", currentSuspensionLogId: null }),
			expect.any(String),
		);
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
