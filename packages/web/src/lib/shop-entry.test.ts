import { describe, expect, test } from "bun:test";
import type { MyShop, MyShopResponse } from "~/types";
import { shopEntryFor } from "./shop-entry";

const baseShop: MyShop = {
	id: "shop-1",
	handle: "my-shop",
	name: "My Shop",
	description: null,
	logo: null,
	banner: null,
	contact: { phone: null, whatsapp: null, email: null },
	location: { city: null, region: null, country: null, countryCode: null },
	categories: [],
	level: 0,
	badge: null,
	legalVerified: false,
	legal: null,
	publishedListingCount: 0,
	createdAt: "2024-01-01T00:00:00.000Z",
	owner: {
		id: "user-1",
		name: "Owner",
		avatar: null,
		rating: 0,
		totalReviews: 0,
		memberSince: "2024-01-01T00:00:00.000Z",
	},
	status: "active",
	handleChangedAt: null,
	nextHandleChangeAt: null,
	suspension: null,
};

function myShopResponse(shop: MyShop | null): MyShopResponse {
	return { shop, role: shop ? "owner" : null, counts: null };
}

describe("shopEntryFor", () => {
	test("an active shop points to the seller dashboard", () => {
		const entry = shopEntryFor(myShopResponse(baseShop), true);
		expect(entry).toEqual({ href: "/seller", key: "myShop" });
	});

	test("no shop offers to open one when shop creation is enabled", () => {
		const entry = shopEntryFor(myShopResponse(null), true);
		expect(entry).toEqual({ href: "/shop/new", key: "openShop" });
	});

	test("no shop offers nothing when shop creation is disabled", () => {
		const entry = shopEntryFor(myShopResponse(null), false);
		expect(entry).toBeNull();
	});

	test("a closed shop offers to open a new one", () => {
		const closed = myShopResponse({ ...baseShop, status: "closed" });
		const entry = shopEntryFor(closed, true);
		expect(entry).toEqual({ href: "/shop/new", key: "openShop" });
	});

	// The regression this pins: `useMyShop` used to flatten a failed
	// `GET /api/shops/mine` to the same `null` as "no shop", so a request that
	// merely failed made the header offer to open a new shop to someone who
	// already has one. `unknown` must never fall back to `openShop`.
	test("an unknown shop status (a failed lookup) offers nothing, even when shop creation is enabled", () => {
		const entry = shopEntryFor(null, true, true);
		expect(entry).toBeNull();
	});

	test("an unknown shop status still resolves to the seller dashboard if a shop is already known", () => {
		const entry = shopEntryFor(myShopResponse(baseShop), true, true);
		expect(entry).toEqual({ href: "/seller", key: "myShop" });
	});
});
