import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Mocks `../meilisearch.ts` directly rather than the `meilisearch` package:
// that module memoizes a single client across the whole `bun test` process,
// so whichever test file touches it first (handlers.test.ts) would otherwise
// keep every later file's mock class from ever taking effect.
const mockConfigureShopsIndex = mock(() => Promise.resolve());
const mockClearShopsIndex = mock(() => Promise.resolve());
const mockIndexShopDocuments = mock((_docs: unknown[]) => Promise.resolve());
const mockClearIndex = mock(() => Promise.resolve());
const mockIndexDocuments = mock((_docs: unknown[]) => Promise.resolve());
const mockPruneListings = mock((_keep: Set<string>) => Promise.resolve(1));
const mockPruneShops = mock((_keep: Set<string>) => Promise.resolve(0));
let storedVersion: string | null = null;
const mockWriteDocumentVersion = mock((version: string) => {
	storedVersion = version;
	return Promise.resolve();
});

mock.module("../meilisearch.ts", () => ({
	configureIndex: mock(() => Promise.resolve()),
	clearIndex: mockClearIndex,
	indexDocuments: mockIndexDocuments,
	configureShopsIndex: mockConfigureShopsIndex,
	clearShopsIndex: mockClearShopsIndex,
	indexShopDocuments: mockIndexShopDocuments,
	pruneListings: mockPruneListings,
	pruneShops: mockPruneShops,
	readDocumentVersion: () => Promise.resolve(storedVersion),
	writeDocumentVersion: mockWriteDocumentVersion,
}));

import {
	DOCUMENT_VERSION,
	ensureDocumentsCurrent,
	reindexShops,
} from "../reindex.ts";

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

beforeEach(() => {
	mockConfigureShopsIndex.mockClear();
	mockClearShopsIndex.mockClear();
	mockIndexShopDocuments.mockClear();
	mockClearIndex.mockClear();
	mockIndexDocuments.mockClear();
	mockPruneListings.mockClear();
	mockPruneShops.mockClear();
	mockWriteDocumentVersion.mockClear();
	storedVersion = null;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("reindexShops", () => {
	test("configures and clears the shops index, then paginates active shops into it", async () => {
		const calls: string[] = [];
		const docsByPage: Record<number, Record<string, unknown>[]> = {
			1: [
				{
					id: "shop-1",
					handle: "akwatech",
					name: "Akwa",
					status: "active",
					categories: [],
					createdAt: "x",
				},
				{
					id: "shop-2",
					handle: "closed",
					name: "Closed",
					status: "suspended",
					categories: [],
					createdAt: "x",
				},
			],
			2: [
				{
					id: "shop-3",
					handle: "third",
					name: "Third",
					status: "active",
					categories: [],
					createdAt: "x",
				},
			],
		};
		globalThis.fetch = mock((url: string) => {
			calls.push(url);
			const page = Number(new URL(url).searchParams.get("page"));
			return Promise.resolve(
				jsonResponse({ docs: docsByPage[page] ?? [], hasNextPage: page < 2 }),
			);
		}) as unknown as typeof fetch;

		const count = await reindexShops();

		expect(calls.filter((u) => u.includes("/shops?"))).toHaveLength(2);
		expect(mockConfigureShopsIndex).toHaveBeenCalledTimes(1);
		expect(mockClearShopsIndex).toHaveBeenCalledTimes(1);

		// One batch per page, and a suspended shop never reaches a batch.
		expect(mockIndexShopDocuments).toHaveBeenCalledTimes(2);
		const firstBatch = mockIndexShopDocuments.mock.calls[0]?.[0] as Array<
			Record<string, unknown>
		>;
		expect(firstBatch.map((doc) => doc.id)).toEqual(["shop-1"]);
		const secondBatch = mockIndexShopDocuments.mock.calls[1]?.[0] as Array<
			Record<string, unknown>
		>;
		expect(secondBatch.map((doc) => doc.id)).toEqual(["shop-3"]);

		expect(count).toBe(2);
	});

	test("throws on a non-OK shops response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("fail", { status: 500 })),
		) as unknown as typeof fetch;

		expect(reindexShops()).rejects.toThrow("Failed to fetch shops: 500");
	});
});

describe("ensureDocumentsCurrent", () => {
	const listing = {
		id: "l-1",
		title: "Moto",
		status: "published",
		category: { id: "c", slug: "motos" },
		createdAt: "x",
		updatedAt: "x",
	};

	function serve() {
		globalThis.fetch = mock((url: string) => {
			if (url.includes("/listings?"))
				return Promise.resolve(
					jsonResponse({
						docs: [listing, { ...listing, id: "l-2", status: "draft" }],
						hasNextPage: false,
						totalDocs: 2,
					}),
				);
			if (url.includes("/shops?"))
				return Promise.resolve(
					jsonResponse({
						docs: [
							{
								id: "s-1",
								handle: "a",
								name: "A",
								status: "active",
								categories: [],
								createdAt: "x",
							},
						],
						hasNextPage: false,
					}),
				);
			return Promise.resolve(jsonResponse({ docs: [] }));
		}) as unknown as typeof fetch;
	}

	test("rebuilds in place, prunes what is gone, then records the version", async () => {
		serve();

		expect(await ensureDocumentsCurrent()).toBe(true);

		// Never cleared: search keeps answering while the rebuild runs.
		expect(mockClearIndex).not.toHaveBeenCalled();
		expect(mockClearShopsIndex).not.toHaveBeenCalled();
		const indexed = mockIndexDocuments.mock.calls[0]?.[0] as Array<{
			id: string;
		}>;
		expect(indexed.map((doc) => doc.id)).toEqual(["l-1"]);
		expect([...(mockPruneListings.mock.calls[0]?.[0] ?? [])]).toEqual(["l-1"]);
		expect([...(mockPruneShops.mock.calls[0]?.[0] ?? [])]).toEqual(["s-1"]);
		expect(storedVersion).toBe(DOCUMENT_VERSION);
	});

	test("does nothing once the stored version is current", async () => {
		storedVersion = DOCUMENT_VERSION;
		serve();

		expect(await ensureDocumentsCurrent()).toBe(false);
		expect(mockIndexDocuments).not.toHaveBeenCalled();
		expect(mockWriteDocumentVersion).not.toHaveBeenCalled();
	});

	test("records no version when the rebuild fails, so the next start redoes it", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("fail", { status: 502 })),
		) as unknown as typeof fetch;

		await expect(ensureDocumentsCurrent()).rejects.toThrow();
		expect(storedVersion).toBeNull();
	});
});
