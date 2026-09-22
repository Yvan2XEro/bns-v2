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
				available: 5,
				variantCount: 2,
				trackInventory: true,
			},
		});
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
});
