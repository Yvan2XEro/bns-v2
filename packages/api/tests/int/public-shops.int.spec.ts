import { beforeEach, describe, expect, it, vi } from "vitest";
import { Listings } from "../../src/collections/Listings";
import { toShopSearchHit } from "../../src/lib/publicShop";
import { resolvePublicShop } from "../../src/services/shops";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T12:00:00.000Z");

function seed() {
	return fakePayload({
		users: [
			{
				id: "u-1",
				name: "Aïcha",
				createdAt: "2024-03-01T00:00:00.000Z",
				rating: 4.8,
				totalReviews: 126,
				phone: "+237600000000",
			},
		],
		shops: [
			{
				id: "s-1",
				handle: "akwatech",
				name: "Akwa Tech",
				owner: "u-1",
				status: "active",
				level: 1,
				publishedListingCount: 0,
				previousHandles: [
					{ handle: "akwa", until: "2099-01-01T00:00:00.000Z" },
					{ handle: "ancient", until: "2026-09-01T00:00:00.000Z" },
				],
				contact: { whatsapp: "+237690421807" },
			},
			{
				id: "s-2",
				handle: "suspended",
				name: "Bad",
				owner: "u-1",
				status: "suspended",
				// Held by an inactive shop: exercises the status guard on the
				// previous-handle lookup, not just the vacuous case where nothing
				// else holds the handle at all.
				previousHandles: [
					{ handle: "oldbad", until: "2099-01-01T00:00:00.000Z" },
				],
			},
			{
				id: "s-3",
				handle: "closed",
				name: "Gone",
				owner: "u-1",
				status: "closed",
			},
		],
		listings: [],
	});
}

describe("resolvePublicShop", () => {
	it("returns the public shape for the current handle", async () => {
		const result = await resolvePublicShop(seed(), "AkwaTech", NOW);
		expect(result).toMatchObject({
			shop: {
				id: "s-1",
				handle: "akwatech",
				contact: { whatsapp: "+237690421807", phone: null },
				owner: { name: "Aïcha", rating: 4.8, totalReviews: 126 },
			},
		});
		expect(JSON.stringify(result)).not.toContain("+237600000000");
	});

	// The shop's own verified-purchase rating, distinct from the owner's
	// person rating the block above pins. The shop page used to make a second
	// select-filtered read because the public shape did not carry these two.
	it("serves the shop's own rating, and zero when none exists yet", async () => {
		const payload = seed();
		(payload.store.shops[0] as { rating?: number }).rating = 4.2;
		(payload.store.shops[0] as { totalReviews?: number }).totalReviews = 17;
		const rated = await resolvePublicShop(payload, "akwatech", NOW);
		expect(rated).toMatchObject({ shop: { rating: 4.2, totalReviews: 17 } });

		const unrated = await resolvePublicShop(seed(), "akwatech", NOW);
		expect(unrated).toMatchObject({ shop: { rating: 0, totalReviews: 0 } });
	});

	it("redirects an unexpired previous handle", async () => {
		expect(await resolvePublicShop(seed(), "akwa", NOW)).toEqual({
			redirectTo: "akwatech",
		});
	});

	it("forgets an expired previous handle", async () => {
		expect(await resolvePublicShop(seed(), "ancient", NOW)).toBeNull();
	});

	it("hides suspended and closed shops", async () => {
		expect(await resolvePublicShop(seed(), "suspended", NOW)).toBeNull();
		expect(await resolvePublicShop(seed(), "closed", NOW)).toBeNull();
	});

	it("does not redirect to a previous handle held by an inactive shop", async () => {
		expect(await resolvePublicShop(seed(), "oldbad", NOW)).toBeNull();
	});
});

describe("publishedListingCount", () => {
	const afterChange = Listings.hooks?.afterChange?.[0] as (
		args: unknown,
	) => Promise<unknown>;

	it("recounts the shop when a listing is published or leaves", async () => {
		const payload = seed();
		payload.store.listings.push(
			{ id: "l-1", shop: "s-1", status: "published" },
			{ id: "l-2", shop: "s-1", status: "draft" },
		);
		await afterChange({
			operation: "update",
			doc: { id: "l-1", shop: "s-1", status: "published" },
			previousDoc: { id: "l-1", shop: "s-1", status: "draft" },
			req: { payload, context: {} },
		});
		expect(payload.store.shops[0].publishedListingCount).toBe(1);

		payload.store.listings[0].shop = null;
		await afterChange({
			operation: "update",
			doc: { id: "l-1", shop: null, status: "published" },
			previousDoc: { id: "l-1", shop: "s-1", status: "published" },
			req: { payload, context: {} },
		});
		expect(payload.store.shops[0].publishedListingCount).toBe(0);
	});

	it("never mutates the caller's request context", async () => {
		const payload = seed();
		payload.store.listings.push({
			id: "l-1",
			shop: "s-1",
			status: "published",
		});
		// Payload's real `createLocalReq` reassigns `req.context` in place when a
		// local API call is given both `req` and `context` — the bug this guards
		// against. A getter-only `context` makes that reassignment throw instead
		// of silently widening the caller's request for every write that follows.
		const context = {};
		const req: { payload: typeof payload; context: unknown } = {
			payload,
			context: undefined,
		};
		Object.defineProperty(req, "context", {
			get: () => context,
			configurable: true,
		});

		await afterChange({
			operation: "create",
			doc: { id: "l-1", shop: "s-1", status: "published" },
			previousDoc: undefined,
			req,
		});

		expect(payload.store.shops[0].publishedListingCount).toBe(1);
		expect(req.context).toBe(context);
	});
});

describe("toShopSearchHit", () => {
	it("maps an index document", () => {
		expect(
			toShopSearchHit({
				id: "s-1",
				handle: "akwatech",
				name: "Akwa",
				description: null,
				city: "Douala",
				level: 1,
				publishedListingCount: 3,
				logoUrl: null,
				ownerRating: 4.8,
				ownerReviews: 12,
				createdAt: "x",
				categoryIds: ["c"],
			}),
		).toEqual({
			id: "s-1",
			handle: "akwatech",
			name: "Akwa",
			badge: "phone",
			description: null,
			city: "Douala",
			level: 1,
			publishedListingCount: 3,
			logoUrl: null,
			ownerRating: 4.8,
			ownerReviews: 12,
			createdAt: "x",
		});
	});

	it("I5: agrees with the Payload fallback path on an expired level-3 shop, now that the index carries levelExpiresAt", () => {
		const indexed = {
			id: "s-2",
			handle: "expired-shop",
			name: "Expired Shop",
			description: null,
			city: "Douala",
			level: 3,
			levelExpiresAt: "2020-01-01T00:00:00.000Z",
			publishedListingCount: 3,
			logoUrl: null,
			ownerRating: 4.8,
			ownerReviews: 12,
			createdAt: "x",
			categoryIds: ["c"],
		};
		const populated = {
			id: "s-2",
			handle: "expired-shop",
			name: "Expired Shop",
			status: "active",
			level: 3,
			levelExpiresAt: "2020-01-01T00:00:00.000Z",
		};
		expect(toShopSearchHit(indexed).badge).toBe("phone");
		expect(toShopSearchHit(indexed).badge).toBe(
			toShopSearchHit(populated).badge,
		);
	});
});

describe("GET /api/public/shops/{handle}", () => {
	const getPayloadMock = vi.fn();
	beforeEach(() => {
		vi.resetModules();
		vi.doMock("@payload-config", () => ({ default: {} }));
		vi.doMock("payload", async (importOriginal) => ({
			...(await importOriginal<typeof import("payload")>()),
			getPayload: getPayloadMock,
		}));
	});

	it("answers 404 with shop.notFound", async () => {
		getPayloadMock.mockResolvedValue(seed());
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/shops/[handle]/route"
		);
		const res = await GET(new Request("http://x"), {
			params: Promise.resolve({ handle: "closed" }),
		});
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ code: "shop.notFound" });
	});

	it("returns the redirect target", async () => {
		getPayloadMock.mockResolvedValue(seed());
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/shops/[handle]/route"
		);
		const res = await GET(new Request("http://x"), {
			params: Promise.resolve({ handle: "akwa" }),
		});
		expect(await res.json()).toEqual({ redirectTo: "akwatech" });
	});

	it("answers 404 rather than 500 on a malformed percent-escape", async () => {
		getPayloadMock.mockResolvedValue(seed());
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/shops/[handle]/route"
		);
		const res = await GET(new Request("http://x"), {
			params: Promise.resolve({ handle: "%" }),
		});
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ code: "shop.notFound" });
	});
});
