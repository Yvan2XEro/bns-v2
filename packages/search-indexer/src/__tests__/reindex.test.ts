import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Mocks `../meilisearch.ts` directly rather than the `meilisearch` package:
// that module memoizes a single client across the whole `bun test` process,
// so whichever test file touches it first (handlers.test.ts) would otherwise
// keep every later file's mock class from ever taking effect.
const mockConfigureShopsIndex = mock(() => Promise.resolve());
const mockClearShopsIndex = mock(() => Promise.resolve());
const mockIndexShopDocuments = mock((_docs: unknown[]) => Promise.resolve());

mock.module("../meilisearch.ts", () => ({
	configureIndex: mock(() => Promise.resolve()),
	clearIndex: mock(() => Promise.resolve()),
	indexDocuments: mock(() => Promise.resolve()),
	configureShopsIndex: mockConfigureShopsIndex,
	clearShopsIndex: mockClearShopsIndex,
	indexShopDocuments: mockIndexShopDocuments,
}));

import { reindexShops } from "../reindex.ts";

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
