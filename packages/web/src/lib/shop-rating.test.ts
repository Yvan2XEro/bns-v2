import { describe, expect, it } from "bun:test";
import { shopRating } from "./shop-rating";

const owner = { rating: 4.2, totalReviews: 7 };

describe("shopRating", () => {
	it("shows the shop's verified-purchase rating once it has one review", () => {
		expect(shopRating({ rating: 4.8, totalReviews: 1 }, owner)).toEqual({
			source: "shop",
			rating: 4.8,
			count: 1,
		});
	});

	it("keeps the owner's rating while the shop has no review", () => {
		expect(shopRating({ rating: null, totalReviews: 0 }, owner)).toEqual({
			source: "owner",
			rating: 4.2,
			count: 7,
		});
	});

	it("keeps the owner's rating when the shop's could not be read", () => {
		expect(shopRating(null, owner)?.source).toBe("owner");
	});

	it("ignores a review count with no rating behind it", () => {
		expect(shopRating({ rating: null, totalReviews: 3 }, owner)?.source).toBe(
			"owner",
		);
	});

	it("shows nothing when neither has a review", () => {
		expect(
			shopRating(
				{ rating: 0, totalReviews: 0 },
				{ rating: 0, totalReviews: 0 },
			),
		).toBeNull();
	});
});
