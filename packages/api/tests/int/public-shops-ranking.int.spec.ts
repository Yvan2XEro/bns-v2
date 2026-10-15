import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyShopRankingScore } from "../../src/lib/shopRanking";
import { recomputeShopRankings } from "../../src/services/shopRanking";
import { fakePayload } from "./helpers/fakePayload";

const { getPayloadMock, searchMock } = vi.hoisted(() => ({
	getPayloadMock: vi.fn(),
	searchMock: vi.fn(),
}));

vi.mock("@payload-config", () => ({ default: {} }));
// Same workaround as public-search-route.int.spec.ts.
vi.mock("../../src/payload.config.ts", () => ({ default: {} }));
vi.mock("meilisearch", () => ({
	MeiliSearch: class {
		index() {
			return { search: searchMock };
		}
	},
}));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<object>()),
	getPayload: getPayloadMock,
}));

const FUTURE = "2099-01-01T00:00:00.000Z";
const PAST = "2020-01-01T00:00:00.000Z";

const shop = (id: string, patch: Record<string, unknown> = {}) => ({
	id,
	handle: id,
	name: `Shop ${id}`,
	status: "active",
	level: 2,
	rating: 4.6,
	totalReviews: 12,
	rankingScore: 50,
	publishedListingCount: 4,
	location: { city: "Douala" },
	featured: { until: FUTURE, cities: [], categories: [] },
	createdAt: "2026-01-01T00:00:00.000Z",
	...patch,
});

const indexed = (id: string) => ({
	id,
	handle: id,
	name: `Shop ${id}`,
	city: "Douala",
	level: 2,
	publishedListingCount: 4,
	createdAt: "2026-01-01T00:00:00.000Z",
});

function seed(data: Record<string, Record<string, unknown>[]>) {
	const payload = fakePayload(data);
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

async function get(query: string) {
	const { GET } = await import(
		"../../src/app/(frontend)/api/public/search/shops/route"
	);
	const res = await GET(
		new Request(`http://x/api/public/search/shops${query}`),
	);
	return res.json();
}

const ids = (hits: { id: string }[]) => hits.map((hit) => hit.id);

describe("shops search ranking", () => {
	beforeEach(() => {
		getPayloadMock.mockReset();
		searchMock.mockReset();
		process.env.MEILI_HOST = "http://meili.example.test";
	});

	it("orders by the organic ranking when there is no query", async () => {
		seed({ shops: [] });
		searchMock.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

		await get("");
		expect(searchMock.mock.calls.at(-1)?.[1]?.sort).toEqual([
			"rankingScore:desc",
		]);
		await get("?sort=relevance");
		expect(searchMock.mock.calls.at(-1)?.[1]?.sort).toEqual([
			"rankingScore:desc",
		]);
		await get("?q=tel&sort=ranking");
		expect(searchMock.mock.calls.at(-1)?.[1]?.sort).toEqual([
			"rankingScore:desc",
		]);
		await get("?sort=rating");
		expect(searchMock.mock.calls.at(-1)?.[1]?.sort).toEqual([
			"rating:desc",
			"totalReviews:desc",
		]);
		await get("?sort=bogus&q=tel");
		expect(searchMock.mock.calls.at(-1)?.[1]?.sort).toBeUndefined();
	});

	it("sorts the Payload fallback by ranking or rating too", async () => {
		// biome-ignore lint/performance/noDelete: an undefined assignment coerces to the string "undefined", which stays truthy
		delete process.env.MEILI_HOST;
		const none = { until: null, cities: [], categories: [] };
		seed({
			shops: [
				shop("low", { rankingScore: 10, rating: 4.9, featured: none }),
				shop("high", { rankingScore: 80, rating: 3, featured: none }),
				shop("mid", { rankingScore: 40, rating: 4, featured: none }),
			],
		});

		expect(ids((await get("")).hits)).toEqual(["high", "mid", "low"]);
		expect(ids((await get("?sort=rating")).hits)).toEqual([
			"low",
			"mid",
			"high",
		]);
	});

	it("returns at most two sponsored shops, apart from the hits and never in them", async () => {
		seed({
			shops: [
				shop("a", { rankingScore: 90 }),
				shop("b", { rankingScore: 80 }),
				shop("c", { rankingScore: 70 }),
				shop("organic", { featured: undefined }),
			],
		});
		searchMock.mockResolvedValue({
			hits: [indexed("a"), indexed("organic"), indexed("c")],
			estimatedTotalHits: 3,
		});

		const body = await get("");

		expect(ids(body.sponsored)).toEqual(["a", "b"]);
		expect(ids(body.hits)).toEqual(["organic", "c"]);
		expect(body.total).toBe(2);
	});

	it("never sponsors a suspended, unverified, low-rated or expired shop", async () => {
		seed({
			shops: [
				shop("suspended", { status: "suspended" }),
				shop("unverified", { level: 1 }),
				shop("lapsed", { level: 2, levelExpiresAt: PAST }),
				shop("low-rated", { rating: 3.2 }),
				shop("few-reviews", { totalReviews: 1 }),
				shop("expired", {
					featured: { until: PAST, cities: [], categories: [] },
				}),
				shop("ok"),
			],
		});
		searchMock.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

		expect(ids((await get("")).sponsored)).toEqual(["ok"]);
	});

	it("matches the slot's city and category, and only on the first page", async () => {
		seed({
			shops: [
				shop("douala-phones", {
					featured: {
						until: FUTURE,
						cities: ["Douala"],
						categories: ["c-phones"],
					},
				}),
			],
			categories: [{ id: "c-tech" }, { id: "c-phones", parent: "c-tech" }],
		});
		searchMock.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

		expect((await get("")).sponsored).toEqual([]);
		expect((await get("?city=Douala")).sponsored).toEqual([]);
		expect(ids((await get("?city=Douala&category=c-tech")).sponsored)).toEqual([
			"douala-phones",
		]);
		expect(
			(await get("?city=Yaound%C3%A9&category=c-phones")).sponsored,
		).toEqual([]);
		expect(
			(await get("?city=Douala&category=c-phones&offset=20")).sponsored,
		).toEqual([]);
	});

	it("respects the level floor and the text query for sponsored shops", async () => {
		seed({ shops: [shop("plain-name")] });
		searchMock.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

		expect((await get("?minShopLevel=3")).sponsored).toEqual([]);
		expect((await get("?q=telephones")).sponsored).toEqual([]);
		expect(ids((await get("?q=plain")).sponsored)).toEqual(["plain-name"]);
	});
});

describe("recomputeShopRankings", () => {
	it("refreshes order and freshness signals and skips unchanged shops", async () => {
		const now = new Date("2026-10-15T12:00:00.000Z");
		const payload = seed({
			shops: [
				{ id: "s-1", status: "active", level: 2, publishedListingCount: 2 },
				{ id: "s-closed", status: "closed" },
			],
			"shop-daily-stats": [
				{
					shop: "s-1",
					date: "2026-10-10",
					ordersPlaced: 5,
					ordersAccepted: 4,
					ordersDelivered: 3,
				},
				{
					shop: "s-1",
					date: "2026-01-01",
					ordersPlaced: 50,
					ordersAccepted: 0,
					ordersDelivered: 0,
				},
			],
			listings: [
				{
					id: "l-1",
					shop: "s-1",
					status: "published",
					updatedAt: "2026-10-12T00:00:00.000Z",
				},
				{
					id: "l-2",
					shop: "s-1",
					status: "draft",
					updatedAt: "2026-10-14T00:00:00.000Z",
				},
			],
		});

		const first = await recomputeShopRankings(payload, now);
		expect(first).toEqual({ checked: 1, updated: 1 });
		const updated = payload.store.shops.find((doc) => doc.id === "s-1");
		expect(updated?.rankingSignals).toEqual({
			ordersPlaced: 5,
			ordersAccepted: 4,
			ordersDelivered: 3,
			catalogueUpdatedAt: "2026-10-12T00:00:00.000Z",
		});

		// The fake runs no hooks: store the score the Shops hook would have.
		if (updated)
			updated.rankingScore = applyShopRankingScore({
				data: {},
				originalDoc: updated,
			}).rankingScore;
		expect(await recomputeShopRankings(payload, now)).toEqual({
			checked: 1,
			updated: 0,
		});
	});
});
