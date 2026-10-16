import { describe, expect, it } from "bun:test";
import {
	COMPACT_FADE_DP,
	categoryTreeOf,
	compactBarOpacity,
	compactBarThreshold,
	contactBarVisible,
	footerSpacer,
	pinOffset,
	shopCategoryChips,
	shopFacetQuery,
	shopRatingOf,
	shopSearchQuery,
	shopTrustStrip,
	showCategoryRow,
	stickyTop,
	tabSwitchOffset,
	trustItemText,
} from "./shopStorefront";

const params = (qs: string) => Object.fromEntries(new URLSearchParams(qs));

describe("shopSearchQuery", () => {
	it("maps each sort to the search API's own value", () => {
		for (const sort of ["newest", "price_asc", "price_desc"] as const) {
			expect(
				params(shopSearchQuery({ shopId: "s1", sort, offset: 0 })),
			).toEqual({ shop: "s1", sort, limit: "20", offset: "0" });
		}
	});

	it("adds the trimmed query and the category only when set", () => {
		expect(
			params(
				shopSearchQuery({
					shopId: "s1",
					sort: "price_asc",
					offset: 40,
					q: "  coque ",
					category: "phones",
				}),
			),
		).toEqual({
			shop: "s1",
			sort: "price_asc",
			limit: "20",
			offset: "40",
			q: "coque",
			category: "phones",
		});
		expect(
			params(
				shopSearchQuery({
					shopId: "s1",
					sort: "newest",
					offset: 0,
					q: "  ",
					category: null,
				}),
			),
		).not.toHaveProperty("q");
	});

	it("asks for the whole shop's category facets", () => {
		expect(params(shopFacetQuery("s1"))).toEqual({
			shop: "s1",
			facets: "category",
			limit: "1",
		});
	});
});

describe("category chips", () => {
	const tree = categoryTreeOf([
		{ id: "electronics", name: "Électronique", parent: null },
		{ id: "phones", name: "Téléphones", parent: "electronics" },
		{ id: "computers", name: "Ordinateurs", parent: { id: "electronics" } },
	]);

	it("groups with the shared contract helper", () => {
		expect(shopCategoryChips({ phones: 12, computers: 30 }, tree)).toEqual([
			{ id: "computers", name: "Ordinateurs", count: 30 },
			{ id: "phones", name: "Téléphones", count: 12 },
		]);
	});

	it("hides the row for a single category or unreadable counts", () => {
		expect(shopCategoryChips({ phones: 12 }, tree)).toBeNull();
		expect(shopCategoryChips(null, tree)).toBeNull();
		expect(
			shopCategoryChips({ phones: 1, computers: 1 }, new Map()),
		).toBeNull();
		expect(showCategoryRow([])).toBe(false);
		expect(showCategoryRow([1])).toBe(false);
		expect(showCategoryRow([1, 2])).toBe(true);
	});
});

describe("scroll thresholds", () => {
	const bar = 100;

	it("shows the compact bar once the name is under it", () => {
		const threshold = compactBarThreshold(260, bar);
		expect(threshold).toBe(160);
		expect(compactBarOpacity(0, threshold)).toBe(0);
		expect(compactBarOpacity(threshold - COMPACT_FADE_DP, threshold)).toBe(0);
		expect(compactBarOpacity(threshold - COMPACT_FADE_DP / 2, threshold)).toBe(
			0.5,
		);
		expect(compactBarOpacity(threshold, threshold)).toBe(1);
		expect(compactBarOpacity(threshold + 500, threshold)).toBe(1);
	});

	it("keeps the bar hidden before the name is measured", () => {
		expect(compactBarOpacity(0, 0)).toBe(0);
	});

	it("moves the tabs with the content, then pins them under the bar", () => {
		expect(stickyTop(400, 0, bar)).toBe(400);
		expect(stickyTop(400, -50, bar)).toBe(450);
		expect(stickyTop(400, 300, bar)).toBe(bar);
		expect(stickyTop(400, 900, bar)).toBe(bar);
		expect(pinOffset(400, bar)).toBe(300);
		expect(pinOffset(50, bar)).toBe(0);
	});

	it("shows the contact bar once the header buttons are under the bar", () => {
		expect(contactBarVisible(100, 340, bar)).toBe(false);
		expect(contactBarVisible(241, 340, bar)).toBe(true);
		expect(contactBarVisible(1000, 0, bar)).toBe(false);
	});

	it("keeps each tab's place without re-expanding the banner", () => {
		expect(tabSwitchOffset({ current: 120, pin: 300, saved: 900 })).toBe(120);
		expect(tabSwitchOffset({ current: 500, pin: 300, saved: 900 })).toBe(900);
		expect(tabSwitchOffset({ current: 500, pin: 300, saved: undefined })).toBe(
			300,
		);
		expect(tabSwitchOffset({ current: 500, pin: 300, saved: 40 })).toBe(300);
	});

	it("pads a short tab so it can still reach the pin", () => {
		expect(
			footerSpacer({
				contentHeight: 900,
				currentSpacer: 0,
				viewportHeight: 800,
				pin: 300,
			}),
		).toBe(200);
		expect(
			footerSpacer({
				contentHeight: 1100,
				currentSpacer: 200,
				viewportHeight: 800,
				pin: 300,
			}),
		).toBe(200);
		expect(
			footerSpacer({
				contentHeight: 4000,
				currentSpacer: 0,
				viewportHeight: 800,
				pin: 300,
			}),
		).toBe(0);
	});
});

describe("trust strip", () => {
	const now = new Date("2026-10-16T12:00:00Z");
	const base = {
		createdAt: "2024-03-01T00:00:00Z",
		publishedListingCount: 48,
		location: { city: "Ville" },
		rating: 4.8,
		totalReviews: 126,
		owner: { rating: 4.1, totalReviews: 9 },
	};
	const t = (key: string, options?: Record<string, unknown>) =>
		options ? `${key}:${JSON.stringify(options)}` : key;

	it("reads the API's trust fields through the shared helper", () => {
		const items = shopTrustStrip(
			{
				...base,
				trust: {
					responseTime: "under_1h",
					activeListings: 48,
					memberSince: "2024-03-01T00:00:00Z",
					isNew: false,
				},
			},
			now,
		);
		expect(items.map((i) => i.kind)).toEqual([
			"rating",
			"responseTime",
			"city",
			"memberSince",
			"activeListings",
		]);
		expect(items.map((i) => trustItemText(i, t, "fr"))).toEqual([
			'shop.trustRating:{"rating":"4,8","count":126}',
			"shop.trustResponse.under_1h",
			"Ville",
			'shop.trustSince:{"year":2024}',
			'shop.trustListings:{"count":48}',
		]);
	});

	it("never shows a zero stat and says « Nouvelle boutique » for a new shop", () => {
		const items = shopTrustStrip(
			{
				createdAt: "2026-10-10T00:00:00Z",
				publishedListingCount: 0,
				location: { city: null },
				rating: 0,
				totalReviews: 0,
				owner: { rating: 0, totalReviews: 0 },
				trust: {
					responseTime: null,
					activeListings: 0,
					memberSince: "2026-10-10T00:00:00Z",
					isNew: true,
				},
			},
			now,
		);
		expect(items).toEqual([{ kind: "newShop" }]);
	});

	it("falls back on the existing fields when the API has no trust yet", () => {
		const items = shopTrustStrip({ ...base, trust: undefined }, now);
		expect(items.map((i) => i.kind)).toEqual([
			"rating",
			"city",
			"memberSince",
			"activeListings",
		]);
	});

	it("uses the shop's rating once it has a review, the owner's before", () => {
		expect(shopRatingOf(base)).toEqual({ value: 4.8, count: 126 });
		expect(shopRatingOf({ ...base, totalReviews: 0 })).toEqual({
			value: 4.1,
			count: 9,
		});
		expect(
			shopRatingOf({
				...base,
				totalReviews: 0,
				owner: { rating: 0, totalReviews: 0 },
			}),
		).toBeNull();
	});

	it("formats the rating for the reader's language", () => {
		const [rating] = shopTrustStrip({ ...base, trust: null }, now);
		if (!rating) throw new Error("no rating");
		expect(trustItemText(rating, t, "en")).toContain('"rating":"4.8"');
	});
});
