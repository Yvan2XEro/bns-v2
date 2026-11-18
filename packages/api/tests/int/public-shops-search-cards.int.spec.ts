import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

const getPayloadMock = vi.fn();
const searchMock = vi.fn();

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
vi.mock("payload", () => ({ getPayload: getPayloadMock }));

const indexed = (id: string, level: number) => ({
	id,
	handle: id,
	name: `Shop ${id}`,
	description: null,
	city: "Douala",
	level,
	publishedListingCount: 2,
	logoUrl: null,
	ownerRating: 0,
	ownerReviews: 0,
	createdAt: "2026-01-01T00:00:00.000Z",
});

function seed(data: Record<string, Record<string, unknown>[]>) {
	getPayloadMock.mockResolvedValue(fakePayload(data));
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

describe("shops search cards", () => {
	beforeEach(() => {
		getPayloadMock.mockReset();
		searchMock.mockReset();
		process.env.MEILI_HOST = "http://meili.example.test";
	});

	it("takes the banner from the live shop and re-applies the level floor live", async () => {
		seed({
			shops: [
				{
					id: "s-1",
					status: "active",
					level: 2,
					banner: { id: "m-1", url: "/media/banner.jpg" },
				},
				// Indexed at level 2, but the level has lapsed since.
				{
					id: "s-2",
					status: "active",
					level: 2,
					levelExpiresAt: "2020-01-01T00:00:00.000Z",
				},
			],
		});
		searchMock.mockResolvedValue({
			hits: [indexed("s-1", 2), indexed("s-2", 2)],
			estimatedTotalHits: 2,
		});

		const body = await get("?minShopLevel=2");

		expect(body.hits.map((hit: { id: string }) => hit.id)).toEqual(["s-1"]);
		expect(body.hits[0].bannerUrl).toBe("/media/banner.jpg");
		expect(body.hits[0].previews).toBeUndefined();
	});

	it("adds each shop's newest published listings when asked for previews", async () => {
		seed({
			shops: [{ id: "s-1", status: "active", level: 1 }],
			listings: [
				{
					id: "l-old",
					title: "Old",
					shop: "s-1",
					status: "published",
					createdAt: "2026-01-01T00:00:00.000Z",
				},
				{
					id: "l-new",
					title: "New",
					shop: "s-1",
					status: "published",
					createdAt: "2026-03-01T00:00:00.000Z",
					images: [
						{
							image: {
								id: "m-2",
								url: "/media/p.jpg",
								thumbnailURL: "/media/p-thumb.jpg",
							},
						},
					],
				},
				{
					id: "l-draft",
					title: "Draft",
					shop: "s-1",
					status: "draft",
					createdAt: "2026-04-01T00:00:00.000Z",
				},
			],
		});
		searchMock.mockResolvedValue({
			hits: [indexed("s-1", 1)],
			estimatedTotalHits: 1,
		});

		const body = await get("?previews=9");

		expect(body.hits[0].previews).toEqual([
			{ id: "l-new", title: "New", imageUrl: "/media/p-thumb.jpg" },
			{ id: "l-old", title: "Old", imageUrl: null },
		]);
	});

	it("filters on a category and its subcategories, and sorts by newest on request", async () => {
		seed({
			shops: [],
			categories: [
				{ id: "c-tech" },
				{ id: "c-phones", parent: "c-tech" },
				{ id: "c-cases", parent: "c-phones" },
			],
		});
		searchMock.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

		await get("?q=tel&category=c-tech&sort=newest");

		const options = searchMock.mock.calls.at(-1)?.[1];
		expect(options.filter).toBe(
			'categoryIds IN ["c-tech", "c-phones", "c-cases"]',
		);
		expect(options.sort).toEqual(["createdAt:desc"]);
	});

	it("keeps relevance order for a query unless another sort is asked", async () => {
		seed({ shops: [] });
		searchMock.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

		await get("?q=tel");
		expect(searchMock.mock.calls.at(-1)?.[1]?.sort).toBeUndefined();
		await get("?q=tel&sort=products");
		expect(searchMock.mock.calls.at(-1)?.[1]?.sort).toEqual([
			"publishedListingCount:desc",
		]);
	});

	it("honours minShopLevel on the Payload path too", async () => {
		// biome-ignore lint/performance/noDelete: an undefined assignment coerces to the string "undefined", which stays truthy
		delete process.env.MEILI_HOST;
		seed({
			shops: [
				{ id: "s-1", handle: "one", name: "One", status: "active", level: 1 },
				{ id: "s-2", handle: "two", name: "Two", status: "active", level: 2 },
				{
					id: "s-3",
					handle: "three",
					name: "Three",
					status: "active",
					level: 3,
					levelExpiresAt: "2020-01-01T00:00:00.000Z",
				},
			],
		});

		const body = await get("?minShopLevel=2");

		expect(body.hits.map((hit: { id: string }) => hit.id)).toEqual(["s-2"]);
		expect(searchMock).not.toHaveBeenCalled();
	});
});
