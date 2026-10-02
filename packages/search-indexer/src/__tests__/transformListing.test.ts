import { describe, expect, test } from "bun:test";
import { transformListing } from "../handlers/listingCreated.ts";

describe("transformListing", () => {
	const baseListing = {
		id: "listing-1",
		title: "iPhone 15 Pro",
		description: "Brand new iPhone 15 Pro 256GB",
		price: 450000,
		location: "Douala",
		status: "published",
		condition: "new",
		boostedUntil: null,
		views: 42,
		images: [{ image: { url: "/media/img1.jpg" } }],
		createdAt: "2026-01-15T10:00:00Z",
		updatedAt: "2026-01-15T10:00:00Z",
		attributes: {},
	};

	test("transforms a listing with a populated category object", () => {
		const listing = {
			...baseListing,
			category: {
				id: "cat-1",
				name: "Électronique",
				attributes: [],
			},
			seller: { id: "user-1", name: "Jean" },
		};

		const doc = transformListing(listing);

		expect(doc.id).toBe("listing-1");
		expect(doc.title).toBe("iPhone 15 Pro");
		expect(doc.price).toBe(450000);
		expect(doc.category).toBe("Électronique");
		expect(doc.categoryId).toBe("cat-1");
		expect(doc.sellerId).toBe("user-1");
		expect(doc.status).toBe("published");
		expect(doc.condition).toBe("new");
		expect(doc.views).toBe(42);
		expect(doc.images).toEqual([
			{
				id: null,
				image: {
					id: null,
					url: "/media/img1.jpg",
					thumbnailURL: null,
					filename: null,
					alt: null,
					width: null,
					height: null,
				},
			},
		]);
		expect(doc.createdAt).toBe("2026-01-15T10:00:00Z");
	});

	test("handles seller as a string ID (not populated)", () => {
		const listing = {
			...baseListing,
			category: { id: "cat-1", name: "Électronique" },
			seller: "user-1",
		};

		const doc = transformListing(listing);
		expect(doc.sellerId).toBe("user-1");
	});

	test("handles category as a string ID (not populated)", () => {
		const listing = {
			...baseListing,
			category: null,
			seller: "user-1",
		};

		const doc = transformListing(listing);
		expect(doc.category).toBeNull();
		expect(doc.categoryId).toBeNull();
	});

	test("flattens filterable dynamic attributes from category definition", () => {
		const listing = {
			...baseListing,
			category: {
				id: "cat-vehicles",
				name: "Véhicules",
				attributes: [
					{ slug: "brand", filterable: true },
					{ slug: "year", filterable: true },
					{ slug: "internalNotes", filterable: false },
				],
			},
			seller: "user-1",
			attributes: {
				brand: "Toyota",
				year: 2022,
				internalNotes: "some internal note",
				color: "red",
			},
		};

		const doc = transformListing(listing);

		expect(doc.brand).toBe("Toyota");
		expect(doc.year).toBe(2022);
		expect(doc.internalNotes).toBeUndefined();
		expect(doc.color).toBeUndefined();
	});

	test("flattens all attributes when category has no attribute definitions", () => {
		const listing = {
			...baseListing,
			category: { id: "cat-misc", name: "Divers" },
			seller: "user-1",
			attributes: {
				brand: "Generic",
				size: "XL",
			},
		};

		const doc = transformListing(listing);

		expect(doc.brand).toBe("Generic");
		expect(doc.size).toBe("XL");
	});

	test("handles missing attributes gracefully", () => {
		const listing = {
			...baseListing,
			category: { id: "cat-1", name: "Électronique" },
			seller: "user-1",
			attributes: undefined,
		};

		const doc = transformListing(listing);
		expect(doc.id).toBe("listing-1");
	});

	test("handles missing optional fields", () => {
		const listing = {
			id: "listing-2",
			title: "Table",
			description: "Table en bois",
			price: 15000,
			location: "Yaoundé",
			status: "draft",
			category: null,
			seller: null,
			createdAt: "2026-02-01T00:00:00Z",
			updatedAt: "2026-02-01T00:00:00Z",
		};

		const doc = transformListing(listing);

		expect(doc.condition).toBeNull();
		expect(doc.boostedUntil).toBeNull();
		expect(doc.views).toBe(0);
		expect(doc.images).toEqual([]);
	});

	test("preserves image ids when uploads are not yet fully populated", () => {
		const listing = {
			...baseListing,
			images: [{ id: "row-1", image: "media-123" }],
			category: { id: "cat-1", name: "Électronique" },
			seller: "user-1",
		};

		const doc = transformListing(listing);

		expect(doc.images).toEqual([
			{
				id: "row-1",
				image: { id: "media-123" },
			},
		]);
	});

	test("adds shop fields when the shop is populated", () => {
		const doc = transformListing({
			...baseListing,
			category: { id: "cat-1", name: "Téléphones", attributes: [] },
			seller: "user-1",
			shop: {
				id: "shop-1",
				handle: "akwatech",
				name: "Akwa Tech Store",
				level: 1,
			},
			productSummary: { priceMin: 285000, priceMax: 330000, available: true },
		});
		expect(doc.shopId).toBe("shop-1");
		expect(doc.shopHandle).toBe("akwatech");
		expect(doc.shopName).toBe("Akwa Tech Store");
		expect(doc.shopLevel).toBe(1);
		expect(doc.priceMax).toBe(330000);
		expect(doc.available).toBe(true);
	});

	// C1: the aggregate stock count used to reach the public index verbatim.
	// A stale/legacy document carrying a number for `available` must not be
	// forwarded as one — only a real boolean survives.
	test("drops a leftover numeric available instead of forwarding it", () => {
		const doc = transformListing({
			...baseListing,
			category: { id: "cat-1", name: "Téléphones", attributes: [] },
			seller: "user-1",
			productSummary: { priceMin: 285000, priceMax: 330000, available: 13 },
		});
		expect(doc.available).toBeNull();
	});

	test("leaves shop fields null for a classified listing", () => {
		const doc = transformListing({
			...baseListing,
			category: { id: "cat-1", name: "X", attributes: [] },
			seller: "user-1",
		});
		expect(doc.shopId).toBeNull();
		expect(doc.shopName).toBeNull();
		expect(doc.priceMax).toBeNull();
	});

	test("copies orderable through when the API computed it true", () => {
		const doc = transformListing({
			...baseListing,
			category: { id: "cat-1", name: "X", attributes: [] },
			seller: "user-1",
			orderable: true,
		});
		expect(doc.orderable).toBe(true);
	});

	// The one implementation of the rule lives on the API side
	// (lib/orderable.ts#isListingOrderable); the indexer only ever carries its
	// answer through. A listing fetched before that virtual existed, or any
	// other falsy/missing value, must not be forwarded as orderable.
	test("defaults orderable to false when absent", () => {
		const doc = transformListing({
			...baseListing,
			category: { id: "cat-1", name: "X", attributes: [] },
			seller: "user-1",
		});
		expect(doc.orderable).toBe(false);
	});

	test("defaults orderable to false for a non-boolean leftover value", () => {
		const doc = transformListing({
			...baseListing,
			category: { id: "cat-1", name: "X", attributes: [] },
			seller: "user-1",
			orderable: "true",
		});
		expect(doc.orderable).toBe(false);
	});

	test("skips filterable attributes that are not present in listing data", () => {
		const listing = {
			...baseListing,
			category: {
				id: "cat-immo",
				name: "Immobilier",
				attributes: [
					{ slug: "rooms", filterable: true },
					{ slug: "surface", filterable: true },
					{ slug: "floor", filterable: true },
				],
			},
			seller: "user-1",
			attributes: {
				rooms: 3,
			},
		};

		const doc = transformListing(listing);

		expect(doc.rooms).toBe(3);
		expect(doc.surface).toBeUndefined();
		expect(doc.floor).toBeUndefined();
	});
});
