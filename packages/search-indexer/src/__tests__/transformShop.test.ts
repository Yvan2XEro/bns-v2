import { describe, expect, test } from "bun:test";
import { transformShop } from "../handlers/shopUpdated.ts";

describe("transformShop", () => {
	test("maps a shop fetched at depth 1", () => {
		expect(
			transformShop({
				id: "shop-1",
				handle: "akwatech",
				name: "Akwa Tech Store",
				description: "Smartphones",
				location: { city: "Douala", region: "Littoral", countryCode: "CM" },
				categories: [{ id: "cat-1", name: "Téléphones" }, "cat-2"],
				level: 3,
				levelExpiresAt: "2026-03-01T00:00:00.000Z",
				publishedListingCount: 304,
				createdAt: "2026-09-15T00:00:00.000Z",
				logo: { url: "/media/logo.png" },
				owner: { id: "u-1", rating: 4.8, totalReviews: 126 },
			}),
		).toEqual({
			id: "shop-1",
			handle: "akwatech",
			name: "Akwa Tech Store",
			description: "Smartphones",
			city: "Douala",
			region: "Littoral",
			countryCode: "CM",
			categoryIds: ["cat-1", "cat-2"],
			level: 3,
			levelExpiresAt: "2026-03-01T00:00:00.000Z",
			publishedListingCount: 304,
			createdAt: "2026-09-15T00:00:00.000Z",
			logoUrl: "/media/logo.png",
			ownerRating: 4.8,
			ownerReviews: 126,
		});
	});

	// I5: the Meilisearch shops index used to carry `level` and nothing else,
	// so `toShopSearchHit`'s badge always fell back to the raw level on this
	// path — an expired level-3 shop showed "identity verified" via search
	// and "phone verified" via the Payload fallback, for the same shop.
	test("I5: carries levelExpiresAt so a badge computed from this document agrees with the Payload fallback path", () => {
		expect(
			transformShop({
				id: "shop-2",
				handle: "expired-shop",
				name: "Expired Shop",
				level: 3,
				levelExpiresAt: null,
				publishedListingCount: 0,
				createdAt: "2026-09-15T00:00:00.000Z",
			}).levelExpiresAt,
		).toBeNull();
	});
});
