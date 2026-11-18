import { describe, expect, test } from "bun:test";
import { listingShopName } from "./listingShop";

describe("listingShopName", () => {
	test("reads the flattened field off a search hit", () => {
		expect(listingShopName({ id: "l1", shopName: "Akwa Tech Store" })).toBe(
			"Akwa Tech Store",
		);
	});

	test("reads the populated relation off a Payload doc", () => {
		expect(
			listingShopName({
				id: "l1",
				shop: { id: "s1", handle: "akwa-tech", name: "Akwa Tech Store" },
			}),
		).toBe("Akwa Tech Store");
	});

	test("prefers the flattened field when both are present", () => {
		expect(
			listingShopName({
				id: "l1",
				shopName: "Search Name",
				shop: { id: "s1", handle: "akwa-tech", name: "Relation Name" },
			}),
		).toBe("Search Name");
	});

	test("returns null for a classified ad carrying neither", () => {
		expect(listingShopName({ id: "l1" })).toBeNull();
		expect(listingShopName({ id: "l1", shop: null })).toBeNull();
	});

	test("returns null when shopName is the wrong runtime type", () => {
		expect(listingShopName({ id: "l1", shopName: 42 })).toBeNull();
		expect(listingShopName({ id: "l1", shopName: {} })).toBeNull();
	});

	test("returns null when the relation is unpopulated (a bare id string)", () => {
		expect(listingShopName({ id: "l1", shop: "s1" })).toBeNull();
	});

	test("returns null when shop.name is the wrong runtime type", () => {
		expect(
			listingShopName({ id: "l1", shop: { id: "s1", name: 42 } }),
		).toBeNull();
	});

	test("returns null for non-object input", () => {
		expect(listingShopName(null)).toBeNull();
		expect(listingShopName(undefined)).toBeNull();
		expect(listingShopName("l1")).toBeNull();
	});
});
