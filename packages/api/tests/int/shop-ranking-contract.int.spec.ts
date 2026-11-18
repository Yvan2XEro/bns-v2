// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	isSponsorEligible,
	type ShopRankingInput,
	SPONSORED_MIN_RATING,
	SPONSORED_MIN_REVIEWS,
	type SponsorCandidate,
	type SponsorContext,
	shopRankingScore,
} from "../../src/contracts/shopRanking";
import { applyShopRankingScore } from "../../src/lib/shopRanking";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const daysAgo = (days: number) =>
	new Date(NOW.getTime() - days * 86_400_000).toISOString();

const base: ShopRankingInput = {
	active: true,
	effectiveLevel: 2,
	rating: 4.5,
	totalReviews: 20,
	publishedListingCount: 30,
	ordersPlaced: 40,
	ordersAccepted: 38,
	ordersDelivered: 36,
	catalogueUpdatedAt: daysAgo(2),
};
const score = (patch: Partial<ShopRankingInput>) =>
	shopRankingScore({ ...base, ...patch }, NOW);

describe("shopRankingScore", () => {
	it("stays within 0-100 and is 0 for an inactive shop", () => {
		expect(score({})).toBeGreaterThan(0);
		expect(score({})).toBeLessThanOrEqual(100);
		expect(score({ active: false })).toBe(0);
		const best = score({
			effectiveLevel: 3,
			rating: 5,
			totalReviews: 1000,
			publishedListingCount: 500,
			ordersPlaced: 1000,
			ordersAccepted: 1000,
			ordersDelivered: 1000,
		});
		expect(best).toBeLessThanOrEqual(100);
		expect(best).toBeGreaterThan(90);
	});

	it("rewards each verification level", () => {
		const levels = [0, 1, 2, 3].map((effectiveLevel) =>
			score({ effectiveLevel }),
		);
		expect([...levels].sort((a, b) => a - b)).toEqual(levels);
		expect(new Set(levels).size).toBe(4);
	});

	it("does not let one 5-star review beat a long good record", () => {
		expect(score({ rating: 5, totalReviews: 1 })).toBeLessThan(
			score({ rating: 4.8, totalReviews: 50 }),
		);
		expect(score({ rating: 2, totalReviews: 30 })).toBeLessThan(
			score({ rating: 0, totalReviews: 0 }),
		);
	});

	it("rewards acceptance and delivery, smoothing small samples", () => {
		expect(
			score({ ordersPlaced: 40, ordersAccepted: 10, ordersDelivered: 8 }),
		).toBeLessThan(score({}));
		expect(
			score({ ordersPlaced: 40, ordersAccepted: 40, ordersDelivered: 10 }),
		).toBeLessThan(score({}));
		// One refused order out of one is not a verdict on the shop.
		const fresh = score({
			ordersPlaced: 0,
			ordersAccepted: 0,
			ordersDelivered: 0,
		});
		const oneRefusal = score({
			ordersPlaced: 1,
			ordersAccepted: 0,
			ordersDelivered: 0,
		});
		expect(fresh - oneRefusal).toBeLessThan(3);
	});

	it("rewards a larger and fresher catalogue, and nothing for an empty one", () => {
		expect(score({ publishedListingCount: 3 })).toBeLessThan(score({}));
		expect(score({ catalogueUpdatedAt: daysAgo(60) })).toBeLessThan(score({}));
		expect(score({ catalogueUpdatedAt: daysAgo(200) })).toBe(
			score({ catalogueUpdatedAt: null }),
		);
		expect(
			score({ publishedListingCount: 0, catalogueUpdatedAt: daysAgo(1) }),
		).toBe(score({ publishedListingCount: 0, catalogueUpdatedAt: null }));
	});

	it("survives garbage inputs", () => {
		expect(
			score({
				rating: Number.NaN,
				totalReviews: -4,
				ordersPlaced: Number.POSITIVE_INFINITY,
				ordersAccepted: 5,
				publishedListingCount: -1,
				catalogueUpdatedAt: "not a date",
			}),
		).toBeGreaterThanOrEqual(0);
	});
});

describe("applyShopRankingScore", () => {
	it("re-derives the score from the merged document on every write", () => {
		const originalDoc = {
			status: "active",
			level: 2,
			rating: 4.5,
			totalReviews: 20,
			publishedListingCount: 30,
			rankingScore: 1,
		};
		const data = applyShopRankingScore({
			data: { totalReviews: 21 },
			originalDoc,
		});
		expect(data.rankingScore).toBeGreaterThan(1);
		expect(
			applyShopRankingScore({ data: { status: "suspended" }, originalDoc })
				.rankingScore,
		).toBe(0);
	});
});

describe("isSponsorEligible", () => {
	const eligible: SponsorCandidate = {
		active: true,
		effectiveLevel: 2,
		rating: SPONSORED_MIN_RATING,
		totalReviews: SPONSORED_MIN_REVIEWS,
		featured: {
			until: "2026-11-01T00:00:00.000Z",
			cities: [],
			categoryIds: [],
		},
	};
	const ctx: SponsorContext = { now: NOW, city: null, categoryIds: null };
	const check = (patch: Partial<SponsorCandidate>, context = ctx) =>
		isSponsorEligible({ ...eligible, ...patch }, context);

	it("accepts a verified, active, well-rated shop with a running slot", () => {
		expect(check({})).toBe(true);
	});

	it("refuses suspended, unverified, low-rated and expired shops", () => {
		expect(check({ active: false })).toBe(false);
		expect(check({ effectiveLevel: 1 })).toBe(false);
		expect(check({ rating: SPONSORED_MIN_RATING - 0.1 })).toBe(false);
		expect(check({ totalReviews: SPONSORED_MIN_REVIEWS - 1 })).toBe(false);
		expect(check({ featured: null })).toBe(false);
		expect(
			check({
				featured: {
					until: "2026-10-15T11:59:59.000Z",
					cities: [],
					categoryIds: [],
				},
			}),
		).toBe(false);
	});

	it("matches the slot's cities and categories", () => {
		const scoped = {
			featured: {
				until: "2026-11-01T00:00:00.000Z",
				cities: ["Douala"],
				categoryIds: ["c-phones"],
			},
		};
		expect(check(scoped)).toBe(false);
		expect(
			check(scoped, {
				now: NOW,
				city: "douala",
				categoryIds: ["c-phones", "c-cases"],
			}),
		).toBe(true);
		expect(
			check(scoped, { now: NOW, city: "Yaoundé", categoryIds: ["c-phones"] }),
		).toBe(false);
		expect(
			check(scoped, { now: NOW, city: "Douala", categoryIds: ["c-cars"] }),
		).toBe(false);
	});
});
