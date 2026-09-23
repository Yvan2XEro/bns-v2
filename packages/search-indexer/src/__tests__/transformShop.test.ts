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
				level: 1,
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
			level: 1,
			publishedListingCount: 304,
			createdAt: "2026-09-15T00:00:00.000Z",
			logoUrl: "/media/logo.png",
			ownerRating: 4.8,
			ownerReviews: 126,
		});
	});
});
