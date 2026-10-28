import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	CATEGORY_COUNTS_MIN_TOTAL,
	type CategoryCounts,
	countOf,
	rankByCounts,
	rollUpCounts,
} from "../../src/contracts/categoryCounts";

const getPayloadMock = vi.fn();
const searchMock = vi.fn();

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("../../src/payload.config.ts", () => ({ default: {} }));
vi.mock("meilisearch", () => ({
	MeiliSearch: class {
		index() {
			return { search: searchMock };
		}
	},
}));
vi.mock("payload", () => ({ getPayload: getPayloadMock }));

const items = ["a", "b", "c", "d"].map((id) => ({ id }));
const counts = (total: number, by: Record<string, number>): CategoryCounts => ({
	city: "Douala",
	total,
	counts: by,
});

describe("ordering by the city's counts", () => {
	it("puts the best stocked first, keeps the editorial order on ties, empty last", () => {
		const ranked = rankByCounts(
			items,
			counts(CATEGORY_COUNTS_MIN_TOTAL, { c: 20, b: 5, d: 5 }),
		);
		expect(ranked.map((i) => i.id)).toEqual(["c", "b", "d", "a"]);
	});

	it("leaves the order alone when the city has too few listings", () => {
		const few = counts(CATEGORY_COUNTS_MIN_TOTAL - 1, { d: 10 });
		expect(rankByCounts(items, few)).toBe(items);
		expect(countOf("d", few)).toBeNull();
		expect(rankByCounts(items, null)).toBe(items);
	});

	it("rolls a listing's category up to every ancestor", () => {
		const parentOf = new Map<string, string | null>([
			["phones", "electronics"],
			["smartphones", "phones"],
			["electronics", null],
			["cars", null],
		]);
		expect(
			rollUpCounts({ smartphones: 4, phones: 1, cars: 2 }, parentOf),
		).toEqual({ smartphones: 4, phones: 5, electronics: 5, cars: 2 });
	});
});

describe("GET /api/public/categories/counts", () => {
	beforeEach(() => {
		vi.resetModules();
		searchMock.mockReset();
		getPayloadMock.mockReset();
		process.env.MEILI_HOST = "http://meili.example.test";
		process.env.MEILI_MASTER_KEY = "test-key";
		searchMock.mockResolvedValue({
			hits: [],
			estimatedTotalHits: 42,
			facetDistribution: { categoryId: { smartphones: 30, cars: 12 } },
		});
		getPayloadMock.mockResolvedValue({
			find: vi.fn(async () => ({
				docs: [
					{ id: "electronics", parent: null },
					{ id: "smartphones", parent: "electronics" },
					{ id: "cars", parent: null },
				],
			})),
		});
	});

	const get = async (query: string) => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/categories/counts/route"
		);
		return GET(
			new Request(`http://localhost:3000/api/public/categories/counts${query}`),
		);
	};

	it("counts published listings of the city per category, rolled up", async () => {
		const response = await get("?city=Douala");
		expect(await response.json()).toEqual({
			city: "Douala",
			total: 42,
			counts: { smartphones: 30, electronics: 30, cars: 12 },
		});
		const [, options] = searchMock.mock.calls[0];
		expect(options.filter).toContain("status = published");
		expect(options.filter).toContain('"Douala"');
		expect(options.facets).toEqual(["categoryId"]);
		expect(response.headers.get("cache-control")).toContain("s-maxage");
	});

	it("answers the same city again from memory", async () => {
		await get("?city=Douala");
		await get("?city=douala");
		expect(searchMock).toHaveBeenCalledTimes(1);
	});

	it("asks for a city", async () => {
		expect((await get("")).status).toBe(400);
	});

	it("gives no counts rather than an error when the search fails", async () => {
		searchMock.mockRejectedValue(new Error("down"));
		const response = await get("?city=Yaoundé");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			city: "Yaoundé",
			total: 0,
			counts: {},
		});
	});
});
