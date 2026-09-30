import { describe, expect, it } from "bun:test";
import type { Listing } from "~/types";
import { listingShopBadge } from "./listing-shop";

describe("listingShopBadge", () => {
	it("shows the business badge for a listing whose shop reached level 3", () => {
		const listing = {
			shop: { id: "s1", level: 3 },
		} as unknown as Listing;

		expect(listingShopBadge(listing)).toBe("business");
	});

	it("reads a search hit's flat shopLevel the same way", () => {
		const listing = { shopLevel: 3 } as unknown as Listing;

		expect(listingShopBadge(listing)).toBe("business");
	});

	it("shows no badge for a personal listing with no shop at all", () => {
		const listing = { shop: null } as unknown as Listing;

		expect(listingShopBadge(listing)).toBeNull();
	});
});
