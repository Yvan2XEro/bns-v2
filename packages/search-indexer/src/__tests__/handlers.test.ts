import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

const mockAddDocuments = mock(() => Promise.resolve());
const mockDeleteDocument = mock(() => Promise.resolve());
const mockDeleteAllDocuments = mock(() => Promise.resolve());
const mockUpdateSettings = mock(() => Promise.resolve());

mock.module("meilisearch", () => ({
	MeiliSearch: class {
		index() {
			return {
				addDocuments: mockAddDocuments,
				deleteDocument: mockDeleteDocument,
				deleteAllDocuments: mockDeleteAllDocuments,
				updateSettings: mockUpdateSettings,
			};
		}
	},
}));

import { handleListingCreated } from "../handlers/listingCreated.ts";
import { handleListingUpdated } from "../handlers/listingUpdated.ts";
import { handleListingDeleted } from "../handlers/listingDeleted.ts";

const sampleApiResponse = {
	id: "listing-123",
	title: "Vélo de course",
	description: "Vélo en très bon état",
	price: 85000,
	location: "Douala",
	status: "published",
	condition: "good",
	boostedUntil: null,
	views: 10,
	images: [],
	category: { id: "cat-sport", name: "Sport", attributes: [] },
	seller: { id: "user-42", name: "Pierre" },
	attributes: {},
	createdAt: "2026-03-01T12:00:00Z",
	updatedAt: "2026-03-01T12:00:00Z",
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
	mockAddDocuments.mockClear();
	mockDeleteDocument.mockClear();
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("handleListingCreated", () => {
	test("fetches listing from Payload API and indexes to Meilisearch", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify(sampleApiResponse), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		) as typeof fetch;

		await handleListingCreated("listing-123");

		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		const fetchCall = (globalThis.fetch as ReturnType<typeof mock>).mock
			.calls[0] as [string];
		expect(fetchCall[0]).toContain("/listings/listing-123?depth=1");

		expect(mockAddDocuments).toHaveBeenCalledTimes(1);
		const indexed = (
			mockAddDocuments.mock.calls[0] as [
				Array<Record<string, unknown>>,
			]
		)[0];
		expect(indexed[0]!.id).toBe("listing-123");
		expect(indexed[0]!.title).toBe("Vélo de course");
		expect(indexed[0]!.category).toBe("Sport");
		expect(indexed[0]!.sellerId).toBe("user-42");
	});

	test("throws on non-OK API response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("Not found", { status: 404 })),
		) as typeof fetch;

		expect(handleListingCreated("nonexistent")).rejects.toThrow(
			"Failed to fetch listing nonexistent: 404",
		);
	});

	test("indexes dynamic attributes", async () => {
		const responseWithAttrs = {
			...sampleApiResponse,
			category: {
				id: "cat-vehicles",
				name: "Véhicules",
				attributes: [
					{ slug: "brand", filterable: true },
					{ slug: "year", filterable: true },
				],
			},
			attributes: { brand: "Honda", year: 2020 },
		};

		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify(responseWithAttrs), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		) as typeof fetch;

		await handleListingCreated("listing-123");

		const indexed = (
			mockAddDocuments.mock.calls[0] as [
				Array<Record<string, unknown>>,
			]
		)[0];
		expect(indexed[0]!.brand).toBe("Honda");
		expect(indexed[0]!.year).toBe(2020);
	});
});

describe("handleListingUpdated", () => {
	test("re-fetches and re-indexes the listing (same as create)", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify(sampleApiResponse), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		) as typeof fetch;

		await handleListingUpdated("listing-123");

		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		expect(mockAddDocuments).toHaveBeenCalledTimes(1);
	});
});

describe("handleListingDeleted", () => {
	test("deletes the document from Meilisearch", async () => {
		await handleListingDeleted("listing-456");

		expect(mockDeleteDocument).toHaveBeenCalledTimes(1);
		expect(mockDeleteDocument).toHaveBeenCalledWith("listing-456");
	});
});
