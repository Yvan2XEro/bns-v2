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
