import { describe, expect, test } from "bun:test";
import { type ShopFactsInput, shopFacts } from "./shop-facts";

const now = new Date("2026-10-31T12:00:00Z");
const daysAgo = (n: number) =>
	new Date(now.getTime() - n * 86_400_000).toISOString();
const text = {
	verified: "Verified shop",
	newThisWeek: (n: number) => `${n} new this week`,
	newThisMonth: (n: number) => `${n} new this month`,
	responseTime: (b: string) => `answers ${b}`,
	newShop: "New shop",
	since: (y: number) => `since ${y}`,
};
const base: ShopFactsInput = {
	verified: false,
	recentListingDates: [],
	responseTime: null,
	isNew: false,
	totalReviews: 4,
	memberSince: daysAgo(30),
	now,
};

describe("a shop card's selling points", () => {
	test("verified, then what is new this week, then how fast it answers", () => {
		const facts = shopFacts(
			{
				...base,
				verified: true,
				recentListingDates: [daysAgo(1), daysAgo(3), daysAgo(12)],
				responseTime: "under_1h",
				memberSince: daysAgo(800),
			},
			text,
		);
		expect(facts).toEqual([
			{ text: "Verified shop", tone: "verified" },
			{ text: "2 new this week", tone: "fresh" },
			{ text: "answers under_1h", tone: "plain" },
		]);
	});

	test("nothing new this week: this month's; nothing at all: no zero", () => {
		expect(
			shopFacts({ ...base, recentListingDates: [daysAgo(12)] }, text),
		).toEqual([{ text: "1 new this month", tone: "fresh" }]);
		expect(
			shopFacts({ ...base, recentListingDates: [daysAgo(60)] }, text),
		).toEqual([]);
	});

	test("a new shop without reviews says so; an old one says since when", () => {
		expect(shopFacts({ ...base, isNew: true, totalReviews: 0 }, text)).toEqual([
			{ text: "New shop", tone: "plain" },
		]);
		expect(
			shopFacts({ ...base, memberSince: "2023-05-01T00:00:00Z" }, text),
		).toEqual([{ text: "since 2023", tone: "plain" }]);
	});
});
