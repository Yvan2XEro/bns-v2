import { describe, expect, it } from "bun:test";
import type { ShopSearchHit } from "~/types";
import {
	DIRECTORY_PAGE_SIZE,
	directoryApiQuery,
	directoryHref,
	pageCount,
	pageWindow,
	parseDirectoryParams,
	shopRating,
	shopsRow,
	showsShopsRow,
} from "./shop-directory";

const hit = (id: string): ShopSearchHit => ({
	id,
	handle: id,
	name: id,
	description: null,
	city: "Douala",
	level: 2,
	badge: "identity",
	publishedListingCount: 3,
	logoUrl: null,
	ownerRating: 0,
	ownerReviews: 0,
	createdAt: "2026-01-01T00:00:00.000Z",
	bannerUrl: null,
});

describe("parseDirectoryParams", () => {
	it("defaults to every shop, ranked, page 1", () => {
		expect(parseDirectoryParams({})).toEqual({
			q: "",
			city: "",
			level: 0,
			category: "",
			sort: "relevance",
			page: 1,
		});
	});

	it("keeps valid filters and drops garbage", () => {
		expect(
			parseDirectoryParams({
				city: " Douala ",
				level: "2",
				category: "c-1",
				sort: "rating",
				page: "3",
			}),
		).toMatchObject({
			city: "Douala",
			level: 2,
			category: "c-1",
			sort: "rating",
			page: 3,
		});
		expect(
			parseDirectoryParams({ level: "9", sort: "newest", page: "-1" }),
		).toMatchObject({ level: 0, sort: "relevance", page: 1 });
		expect(parseDirectoryParams({ city: ["Yaoundé", "Douala"] }).city).toBe(
			"Yaoundé",
		);
	});
});

describe("directoryApiQuery", () => {
	it("maps the filters onto the public shops search", () => {
		const query = new URLSearchParams(
			directoryApiQuery({
				q: "",
				city: "Douala",
				level: 2,
				category: "c-1",
				sort: "products",
				page: 3,
			}),
		);
		expect(Object.fromEntries(query)).toEqual({
			city: "Douala",
			category: "c-1",
			minShopLevel: "2",
			sort: "products",
			limit: String(DIRECTORY_PAGE_SIZE),
			offset: String(2 * DIRECTORY_PAGE_SIZE),
		});
	});

	it("leaves the sort to the server's ranking by default", () => {
		const query = new URLSearchParams(
			directoryApiQuery(parseDirectoryParams({})),
		);
		expect(query.has("sort")).toBe(false);
		expect(query.get("offset")).toBe("0");
	});
});

describe("directoryHref", () => {
	it("is /shops with only the filters that are set", () => {
		expect(directoryHref()).toBe("/shops");
		expect(
			directoryHref({
				q: "téléphones",
				city: "Douala",
				level: 0,
				sort: "relevance",
				page: 1,
			}),
		).toBe("/shops?q=t%C3%A9l%C3%A9phones&city=Douala");
		expect(directoryHref({ category: "c-1", sort: "rating", page: 2 })).toBe(
			"/shops?category=c-1&sort=rating&page=2",
		);
	});
});

describe("pagination", () => {
	it("counts pages and windows the pager", () => {
		expect(pageCount(0)).toBe(1);
		expect(pageCount(DIRECTORY_PAGE_SIZE + 1)).toBe(2);
		expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
		expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, 5]);
		expect(pageWindow(6, 10)).toEqual([4, 5, 6, 7, 8]);
		expect(pageWindow(10, 10)).toEqual([6, 7, 8, 9, 10]);
	});
});

describe("shopsRow", () => {
	it("keeps one sponsored shop at most and fills with organic ones", () => {
		const row = shopsRow({
			sponsored: [hit("s1"), hit("s2")],
			hits: [hit("s1"), hit("o1"), hit("o2"), hit("o3")],
		});
		expect(row.sponsored.map((h) => h.id)).toEqual(["s1"]);
		expect(row.organic.map((h) => h.id)).toEqual(["o1", "o2"]);
	});

	it("is three organic shops without sponsors, and empty without data", () => {
		expect(
			shopsRow({ hits: [hit("a"), hit("b"), hit("c"), hit("d")] }).organic,
		).toHaveLength(3);
		expect(shopsRow(undefined)).toEqual({ sponsored: [], organic: [] });
	});

	it("shows only once the buyer typed a query or picked a category", () => {
		expect(showsShopsRow({})).toBe(false);
		expect(showsShopsRow({ q: "  " })).toBe(false);
		expect(showsShopsRow({ q: "tel" })).toBe(true);
		expect(showsShopsRow({ category: "c-1" })).toBe(true);
	});
});

describe("shopRating", () => {
	it("prefers the shop's own rating, then the owner's", () => {
		expect(
			shopRating({
				rating: 4.2,
				totalReviews: 7,
				ownerRating: 5,
				ownerReviews: 1,
			}),
		).toEqual({ value: 4.2, count: 7 });
		expect(
			shopRating({ totalReviews: 0, ownerRating: 4.9, ownerReviews: 3 }),
		).toEqual({ value: 4.9, count: 3 });
		expect(shopRating({ ownerRating: 0, ownerReviews: 0 })).toBeNull();
	});
});
