// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	deriveListingData,
	listingStatusFor,
} from "../../src/lib/productListing";

const product = {
	id: "p-1",
	title: "iPhone 13 Pro",
	description: "",
	category: { id: "cat-1" },
	attributes: { brand: "Apple" },
	condition: "like_new",
	images: [{ image: { id: "m-1" } }, { image: "m-2" }],
};
const shop = { id: "s-1", location: { city: "Douala" } };

describe("deriveListingData", () => {
	it("takes title, photos, price range and availability from the product", () => {
		const data = deriveListingData(
			product,
			[
				{ price: 330000, stockOnHand: 2, trackInventory: true },
				{
					price: 285000,
					stockOnHand: 4,
					stockReserved: 1,
					trackInventory: true,
				},
			],
			shop,
		);
		expect(data).toEqual({
			title: "iPhone 13 Pro",
			description: "iPhone 13 Pro",
			images: [{ image: "m-1" }, { image: "m-2" }],
			price: 285000,
			category: "cat-1",
			attributes: { brand: "Apple" },
			condition: "like_new",
			location: "Douala",
			shop: "s-1",
			product: "p-1",
			productSummary: {
				priceMin: 285000,
				priceMax: 330000,
				available: true,
				variantCount: 2,
				trackInventory: true,
			},
		});
	});

	it("reports the aggregate as a purchasability boolean, not a unit count", () => {
		// Both variants are fully sold out: still a boolean, and now false.
		expect(
			deriveListingData(
				product,
				[
					{ price: 1000, stockOnHand: 0, trackInventory: true },
					{ price: 2000, stockOnHand: 0, trackInventory: true },
				],
				shop,
			).productSummary.available,
		).toBe(false);

		// An untracked variant is always purchasable.
		expect(
			deriveListingData(product, [{ price: 1000, trackInventory: false }], shop)
				.productSummary.available,
		).toBe(true);

		// No live variant at all: null, like priceMin/priceMax.
		expect(
			deriveListingData(
				product,
				[{ price: 1000, archivedAt: "2026-01-01" }],
				shop,
			).productSummary.available,
		).toBeNull();
	});

	it("falls back to the country when the shop has no city", () => {
		expect(
			deriveListingData(product, [{ price: 1 }], {
				id: "s-1",
				location: { country: "Cameroun" },
			}).location,
		).toBe("Cameroun");
		expect(
			deriveListingData(product, [{ price: 1 }], { id: "s-1" }).location,
		).toBe("Cameroun");
	});
});

describe("listingStatusFor", () => {
	it.each([
		["active", null, "published"],
		["active", "draft", "published"],
		["active", "sold", "published"],
		["active", "pending", "pending"],
		["active", "rejected", "rejected"],
		["draft", "published", "draft"],
		["archived", "published", "draft"],
		["archived", "rejected", "rejected"],
	])("product %s with listing %s → %s", (productStatus, current, expected) => {
		expect(listingStatusFor(productStatus, current)).toBe(expected);
	});

	// A moderator suspended the shop (listing → draft) and lifted it with
	// `restoreListings: false`: the seller's next stock movement must not
	// silently republish what the moderator deliberately left down.
	it("keeps a moderator-held draft listing down even once its product is active again", () => {
		expect(listingStatusFor("active", "draft", true)).toBe("draft");
	});

	// The case Task 9's ruling protected: a listing the seller themselves put
	// in draft (product edit, not moderation) still republishes normally.
	it("still republishes a listing the seller drafted themselves, once the product is active", () => {
		expect(listingStatusFor("active", "draft", false)).toBe("published");
	});

	it("rejected still wins over a moderation hold", () => {
		expect(listingStatusFor("active", "rejected", true)).toBe("rejected");
	});
});
