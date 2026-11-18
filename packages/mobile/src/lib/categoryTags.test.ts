import { describe, expect, test } from "bun:test";
import {
	categoryTagsPath,
	normalizeCategoryTags,
	pruneTagIds,
	pruneTagSlugs,
} from "./categoryTags";
import { listingDraftIssues } from "./listingForm";

describe("category tags", () => {
	test("asks for a category's tags only once a category is chosen", () => {
		expect(categoryTagsPath(null)).toBeNull();
		expect(categoryTagsPath("")).toBeNull();
		expect(categoryTagsPath("abc")).toBe("/api/public/tags?category=abc");
	});

	test("keeps well-formed tags only", () => {
		expect(
			normalizeCategoryTags([
				{ id: "t1", slug: "delivery", name: "Livraison", emoji: "🚚" },
				{ id: "t2", slug: "visit" },
				{ slug: "no-id" },
				null,
			]),
		).toEqual([
			{ id: "t1", slug: "delivery", name: "Livraison", emoji: "🚚" },
			{ id: "t2", slug: "visit", name: "visit" },
		]);
		expect(normalizeCategoryTags({})).toEqual([]);
	});

	test("drops what the new category does not get, same array otherwise", () => {
		const selected = ["t1", "t2"];
		expect(pruneTagIds(selected, ["t2"])).toEqual(["t2"]);
		expect(pruneTagIds(selected, ["t1", "t2", "t3"])).toBe(selected);
		expect(
			pruneTagSlugs(
				["delivery", "visit"],
				[{ id: "t1", slug: "visit", name: "Visite" }],
			),
		).toEqual(["visit"]);
	});
});

describe("listing draft tags", () => {
	const draft = {
		title: "Vélo",
		description: "Bon vélo",
		price: "1000",
		location: "Douala",
		category: { id: "c1" },
		attributes: {},
		images: [{ id: "m1" }],
		tags: ["t1", "t2"],
	};

	test("flags a tag the category does not get, once its tags are known", () => {
		const tagIssue = (applicableTags: string[] | null) =>
			listingDraftIssues(draft, [], { applicableTags }).filter(
				(issue) => issue.path === "tags",
			);
		expect(tagIssue(null)).toEqual([]);
		expect(tagIssue(["t1", "t2"])).toEqual([]);
		expect(tagIssue(["t1"])).toEqual([
			{ path: "tags", rule: "category", params: { count: 1 } },
		]);
	});
});
