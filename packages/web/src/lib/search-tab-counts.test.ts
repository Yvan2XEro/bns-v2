import { describe, expect, test } from "bun:test";
import {
	listingSearchParams,
	searchTabHrefs,
	sharedSearchFilters,
	tabCountPaths,
} from "./search-tab-counts";

const query = (path: string) =>
	Object.fromEntries(new URL(path, "http://x").searchParams);

describe("sharedSearchFilters", () => {
	test("reads the listing tab's names and the shop tab's alike", () => {
		expect(
			sharedSearchFilters({ q: " tel ", location: "Douala", verified: "1" }),
		).toEqual({ q: "tel", city: "Douala", category: "", level: 2 });
		expect(
			sharedSearchFilters({ tab: "shops", city: "Douala", level: "3" }),
		).toEqual({ q: "", city: "Douala", category: "", level: 3 });
		expect(sharedSearchFilters({ level: "9" }).level).toBe(0);
	});
});

describe("tabCountPaths", () => {
	test("counts both tabs with every filter of a listing search", () => {
		const paths = tabCountPaths({
			q: "tel",
			category: "c-1",
			location: "Douala",
			minPrice: "1000",
			tags: "deal",
			attr_brand: "Tecno",
			verified: "1",
			sort: "price_asc",
		});
		expect(paths.listings).toStartWith("/api/public/search?");
		expect(query(paths.listings)).toEqual({
			q: "tel",
			category: "c-1",
			location: "Douala",
			minPrice: "1000",
			tags: "deal",
			attr_brand: "Tecno",
			minShopLevel: "2",
			limit: "0",
		});
		expect(paths.shops).toStartWith("/api/public/search/shops?");
		expect(query(paths.shops)).toEqual({
			q: "tel",
			city: "Douala",
			category: "c-1",
			minShopLevel: "2",
			limit: "0",
		});
	});

	test("counts both tabs with every filter of a shop search", () => {
		const paths = tabCountPaths({
			tab: "shops",
			q: "tel",
			city: "Yaoundé",
			category: "c-2",
			level: "3",
		});
		expect(query(paths.listings)).toEqual({
			q: "tel",
			category: "c-2",
			location: "Yaoundé",
			minShopLevel: "2",
			limit: "0",
		});
		expect(query(paths.shops)).toEqual({
			q: "tel",
			city: "Yaoundé",
			category: "c-2",
			minShopLevel: "3",
			limit: "0",
		});
	});

	test("an empty search counts everything", () => {
		expect(tabCountPaths({})).toEqual({
			listings: "/api/public/search?limit=0",
			shops: "/api/public/search/shops?limit=0",
		});
	});

	test("drops tags without a category, like the search itself", () => {
		expect(listingSearchParams({ tags: "deal" }).has("tags")).toBe(false);
	});
});

describe("searchTabHrefs", () => {
	test("each tab's link keeps the shared filters", () => {
		const hrefs = searchTabHrefs({
			q: "tel",
			location: "Douala",
			category: "c-1",
			verified: "1",
			minPrice: "1000",
		});
		expect(query(hrefs.listings)).toEqual({
			q: "tel",
			category: "c-1",
			location: "Douala",
			verified: "1",
		});
		expect(query(hrefs.shops)).toEqual({
			tab: "shops",
			q: "tel",
			city: "Douala",
			level: "2",
			category: "c-1",
		});
	});

	test("bare search links stay bare", () => {
		expect(searchTabHrefs({})).toEqual({
			listings: "/search",
			shops: "/search?tab=shops",
		});
	});
});
