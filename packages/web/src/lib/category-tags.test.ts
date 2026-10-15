import { describe, expect, it } from "bun:test";
import {
	categoryTagsUrl,
	keepApplicableTags,
	parseTagItems,
	scopedTagSlugs,
} from "./category-tags";

describe("category tags", () => {
	it("asks for a category's tags, and nothing without one", () => {
		expect(categoryTagsUrl("cat 1")).toBe("/api/public/tags?category=cat%201");
		expect(categoryTagsUrl(null)).toBeNull();
	});

	it("keeps only well-formed tags", () => {
		expect(
			parseTagItems([
				{ id: "t1", slug: "delivery", name: "Livraison" },
				{ id: 2 },
			]),
		).toEqual([{ id: "t1", slug: "delivery", name: "Livraison", emoji: null }]);
		expect(parseTagItems({ error: true })).toEqual([]);
	});

	it("drops the selected tags a new category does not get", () => {
		expect(keepApplicableTags(["t1", "t2"], ["t2", "t3"])).toEqual(["t2"]);
	});

	it("keeps a search's tag filter only for tags the category gets", () => {
		const tags = [{ id: "t1", slug: "delivery", name: "Livraison" }];
		expect(scopedTagSlugs(["delivery", "visit"], tags)).toEqual(["delivery"]);
		expect(scopedTagSlugs(["delivery"], [])).toEqual([]);
		expect(scopedTagSlugs(["delivery"], null)).toEqual(["delivery"]);
	});
});
