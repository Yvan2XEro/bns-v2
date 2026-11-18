import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

const getPayloadMock = vi.fn();
const listingsSearchMock = vi.fn();
const shopsSearchMock = vi.fn();

vi.mock("@payload-config", () => ({ default: {} }));
// Same workaround as public-search-route.int.spec.ts: the alias above does
// not resolve to the same module id as the real `import config from
// "@payload-config"` inside the routes' module graph, so it never
// intercepts on its own — mock the concrete file too.
vi.mock("../../src/payload.config.ts", () => ({ default: {} }));
vi.mock("meilisearch", () => ({
	MeiliSearch: class {
		index(name: string) {
			return {
				search: name === "shops" ? shopsSearchMock : listingsSearchMock,
			};
		}
	},
}));
// `APIError`: the config route reaches `lib/serviceError.ts` through
// `lib/paymentSettings.ts`, and it extends that class at import time.
vi.mock("payload", () => ({
	APIError: class APIError extends Error {},
	getPayload: getPayloadMock,
}));

/** Seeds the shared fake Payload the routes' `getPayload({config})` resolves to. */
function seed(shops: Record<string, unknown>[] = []) {
	const payload = fakePayload({ shops }, { globals: { "app-settings": {} } });
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

function searchRequest(query = ""): Request {
	return new Request(`http://localhost:3000/api/public/search${query}`);
}

function shopsSearchRequest(query = ""): Request {
	return new Request(`http://localhost:3000/api/public/search/shops${query}`);
}

async function searchGet() {
	return (await import("../../src/app/(frontend)/api/public/search/route")).GET;
}

async function shopsSearchGet() {
	return (
		await import("../../src/app/(frontend)/api/public/search/shops/route")
	).GET;
}

async function configGet() {
	return (await import("../../src/app/(frontend)/api/public/config/route")).GET;
}

function indexReturns(hits: unknown[]): void {
	listingsSearchMock.mockResolvedValueOnce({
		hits,
		estimatedTotalHits: hits.length,
	});
}

function lastSearchCall(): { filter?: string } {
	return listingsSearchMock.mock.calls.at(-1)?.[1] ?? {};
}

function lastShopsSearchCall(): { filter?: string } {
	return shopsSearchMock.mock.calls.at(-1)?.[1] ?? {};
}

describe("minShopLevel", () => {
	beforeEach(() => {
		getPayloadMock.mockReset();
		listingsSearchMock.mockReset();
		shopsSearchMock.mockReset();
		listingsSearchMock.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
		shopsSearchMock.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
		process.env.MEILI_HOST = "http://meili.example.test";
		process.env.MEILI_MASTER_KEY = "test-key";
		seed([]);
	});

	it("adds a Meilisearch filter for a valid value", async () => {
		const GET = await searchGet();
		await GET(searchRequest("?minShopLevel=2"));
		expect(lastSearchCall().filter).toContain("shopLevel >= 2");
	});

	it("ignores a value outside 1–3 rather than refusing the search", async () => {
		const GET = await searchGet();
		for (const value of ["0", "4", "abc", ""]) {
			await GET(searchRequest(`?minShopLevel=${value}`));
			expect(lastSearchCall().filter ?? "").not.toContain("shopLevel");
		}
	});

	it("drops a hit whose live shop level is below the floor, even when the index says otherwise", async () => {
		// The index still says level 2 (it has not been reindexed since the
		// shop's level lapsed); the shop's live level is 1. `shopLevel >= 2`
		// is sent to Meilisearch, but the live check must catch this one too.
		seed([{ id: "s-1", status: "active", level: 1 }]);
		indexReturns([
			{
				id: "l-1",
				title: "Stale index entry",
				status: "published",
				shopId: "s-1",
				shopLevel: 2,
			},
		]);

		const GET = await searchGet();
		const body = await (await GET(searchRequest("?minShopLevel=2"))).json();

		expect(body.hits).toEqual([]);
	});

	it("drops a hit whose shop is no longer active", async () => {
		seed([{ id: "s-2", status: "suspended", level: 3 }]);
		indexReturns([
			{
				id: "l-2",
				title: "Shop suspended since indexing",
				status: "published",
				shopId: "s-2",
				shopLevel: 3,
			},
		]);

		const GET = await searchGet();
		const body = await (await GET(searchRequest("?minShopLevel=1"))).json();

		expect(body.hits).toEqual([]);
	});

	it("filters the shops index the same way", async () => {
		const GET = await shopsSearchGet();
		await GET(shopsSearchRequest("?minShopLevel=3"));
		expect(lastShopsSearchCall().filter).toContain("level >= 3");
	});

	it("ignores an out-of-range minShopLevel on the shops index too", async () => {
		const GET = await shopsSearchGet();
		await GET(shopsSearchRequest("?minShopLevel=9"));
		expect(lastShopsSearchCall().filter ?? "").not.toContain("level");
	});
});

describe("GET /api/public/config", () => {
	beforeEach(() => {
		getPayloadMock.mockReset();
	});

	it("reports verificationEnabled beside shopsEnabled", async () => {
		seed([]);
		const GET = await configGet();
		const body = await (await GET()).json();
		expect(body).toMatchObject({
			shopsEnabled: false,
			verificationEnabled: false,
		});
	});

	it("reports false when the settings global cannot be read", async () => {
		getPayloadMock.mockResolvedValue({
			findGlobal: async () => {
				throw new Error("settings global unreadable");
			},
		});
		const GET = await configGet();
		const body = await (await GET()).json();
		expect(body).toMatchObject({
			shopsEnabled: false,
			verificationEnabled: false,
		});
	});
});
