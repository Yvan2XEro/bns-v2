import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import { issueMessage } from "./formIssues";
import { listingDraftIssues } from "./listingForm";
import { photoLimitStatus } from "./photoLimit";
import { emptyProductForm, productFormIssues } from "./productForm";

describe("photoLimitStatus", () => {
	test("counts down to the admin's limit", () => {
		expect(photoLimitStatus(1, 3)).toEqual({
			max: 3,
			full: false,
			remaining: 2,
		});
		expect(photoLimitStatus(3, 3)).toEqual({
			max: 3,
			full: true,
			remaining: 0,
		});
	});

	test("a product kept above a lowered limit is full, never negative", () => {
		expect(photoLimitStatus(6, 3)).toEqual({
			max: 3,
			full: true,
			remaining: 0,
		});
	});

	test("an absent limit is the default, a huge one the ceiling", () => {
		expect(photoLimitStatus(0, undefined).max).toBe(3);
		expect(photoLimitStatus(0, 50).max).toBe(10);
	});
});

describe("photo limit copy", () => {
	test("both languages name the count, the limit and the paid option", () => {
		for (const locale of [en, fr]) {
			expect(locale.photoLimit.count).toContain("{{max}}");
			expect(locale.photoLimit.moreSoon.length).toBeGreaterThan(0);
			expect(locale.formIssues.photoLimit).toContain("{{max}}");
		}
	});

	test("the refusal reads as the photo rule with its limit", () => {
		const t = (key: string, params?: Record<string, unknown>) =>
			key === "formIssues.photoLimit" ? `max ${params?.max}` : key;
		expect(
			issueMessage(t, {
				path: "images",
				rule: "photoLimit",
				params: { max: 3 },
			}),
		).toBe("max 3");
	});
});

describe("the forms run the server's photo rule", () => {
	const photos = (n: number) =>
		Array.from({ length: n }, (_, i) => ({ id: `m${i}`, uri: `u${i}` }));
	const draft = (n: number) => ({
		title: "Vélo",
		description: "Bon vélo",
		price: "1000",
		location: "Douala",
		category: { id: "c1" },
		attributes: {},
		images: photos(n),
	});
	const onPhotos = (issues: { path: string; rule: string }[]) =>
		issues.filter((issue) => issue.path === "images");

	test("a listing past the config's limit is refused, an edit that keeps its photos is not", () => {
		expect(
			onPhotos(listingDraftIssues(draft(4), [], { photoLimit: 3 })),
		).toEqual([{ path: "images", rule: "photoLimit", params: { max: 3 } }]);
		expect(
			onPhotos(listingDraftIssues(draft(4), [], { photoLimit: 5 })),
		).toEqual([]);
		expect(
			onPhotos(
				listingDraftIssues(draft(6), [], {
					photoLimit: 3,
					previousImageCount: 6,
				}),
			),
		).toEqual([]);
	});

	test("a product past the config's limit is refused, a saved one above it may keep them", () => {
		const form = emptyProductForm();
		form.title = "Samsung Galaxy";
		form.category = { id: "cat-1", name: "Phones" } as never;
		form.variants = [{ ...form.variants[0], price: "1000" }];
		form.images = photos(4);
		expect(onPhotos(productFormIssues(form, [], { limit: 3 }))).toEqual([
			{ path: "images", rule: "photoLimit", params: { max: 3 } },
		]);
		expect(
			onPhotos(productFormIssues(form, [], { limit: 3, previousCount: 4 })),
		).toEqual([]);
		form.images = photos(5);
		expect(
			onPhotos(productFormIssues(form, [], { limit: 3, previousCount: 4 })),
		).toHaveLength(1);
		expect(onPhotos(productFormIssues(form, []))).toEqual([]);
	});
});
