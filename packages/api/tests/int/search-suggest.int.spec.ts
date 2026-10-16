// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	foldSearchText,
	matchCategories,
	parseRecentSearches,
	rememberSearch,
} from "../../src/contracts/searchSuggest";

describe("rememberSearch", () => {
	it("puts the newest search first", () => {
		expect(rememberSearch(["iphone"], "frigo")).toEqual(["frigo", "iphone"]);
	});

	it("moves a repeated search up instead of listing it twice, accents and case aside", () => {
		expect(rememberSearch(["frigo", "Télé"], "tele")).toEqual([
			"tele",
			"frigo",
		]);
	});

	it("keeps only the most recent ones", () => {
		expect(rememberSearch(["b", "c", "d"], "aa", 3)).toEqual(["aa", "b", "c"]);
	});

	it("does not remember a query too short to mean anything", () => {
		expect(rememberSearch(["frigo"], " a ")).toEqual(["frigo"]);
	});
});

describe("parseRecentSearches", () => {
	it("reads a stored list and drops anything else", () => {
		expect(parseRecentSearches(["a", 2, "b"])).toEqual(["a", "b"]);
		expect(parseRecentSearches("oops")).toEqual([]);
		expect(parseRecentSearches(null)).toEqual([]);
	});
});

describe("matchCategories", () => {
	const categories = [
		{ name: "Téléphones" },
		{ name: "Télévisions" },
		{ name: "Accessoires téléphone" },
		{ name: "Voitures", searchAliases: "bagnole, toyota" },
		{ name: "Maison" },
	];

	it("ranks a name that starts with the query above one word of it", () => {
		expect(matchCategories(categories, "tele").map((c) => c.name)).toEqual([
			"Téléphones",
			"Télévisions",
			"Accessoires téléphone",
		]);
	});

	it("finds a category through the sellers' own words", () => {
		expect(matchCategories(categories, "Toyo").map((c) => c.name)).toEqual([
			"Voitures",
		]);
	});

	it("offers nothing below two characters or with no match", () => {
		expect(matchCategories(categories, "t")).toEqual([]);
		expect(matchCategories(categories, "zzz")).toEqual([]);
	});

	it("folds accents both ways", () => {
		expect(foldSearchText("  Télé  LED ")).toBe("tele led");
	});
});
