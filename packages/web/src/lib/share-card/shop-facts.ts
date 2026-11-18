import type { ShopResponseTime } from "../../../../api/src/contracts/shopTrust";

/** One selling point on a shop's card, in its colour. */
export interface CardFact {
	text: string;
	tone: "verified" | "fresh" | "plain";
}

/** The most selling points a card shows: past three, none is read. */
export const MAX_FACTS = 3;

const DAY_MS = 86_400_000;

export interface ShopFactsInput {
	verified: boolean;
	/** When its latest listings were published, newest first or not. */
	recentListingDates: string[];
	responseTime: ShopResponseTime | null;
	isNew: boolean;
	totalReviews: number;
	memberSince: string;
	now: Date;
}

export interface ShopFactsText {
	verified: string;
	newThisWeek: (count: number) => string;
	newThisMonth: (count: number) => string;
	responseTime: (bucket: ShopResponseTime) => string;
	newShop: string;
	since: (year: number) => string;
}

/**
 * What makes a shop worth a visit, best first: verified, what it put up
 * lately ("5 new listings this week", never its whole catalogue), how fast
 * it answers, then that it is new or has been here for years. A claim it
 * cannot back is left out rather than shown as a zero.
 */
export function shopFacts(
	input: ShopFactsInput,
	text: ShopFactsText,
): CardFact[] {
	const facts: CardFact[] = [];
	if (input.verified) facts.push({ text: text.verified, tone: "verified" });

	const age = (date: string) => input.now.getTime() - Date.parse(date);
	const within = (days: number) =>
		input.recentListingDates.filter(
			(d) => age(d) >= 0 && age(d) < days * DAY_MS,
		).length;
	const week = within(7);
	const month = within(30);
	if (week > 0) facts.push({ text: text.newThisWeek(week), tone: "fresh" });
	else if (month > 0)
		facts.push({ text: text.newThisMonth(month), tone: "fresh" });

	if (input.responseTime)
		facts.push({ text: text.responseTime(input.responseTime), tone: "plain" });

	if (input.isNew && input.totalReviews === 0) {
		facts.push({ text: text.newShop, tone: "plain" });
	} else {
		const since = new Date(input.memberSince);
		if (
			Number.isFinite(since.getTime()) &&
			age(input.memberSince) >= 365 * DAY_MS
		)
			facts.push({ text: text.since(since.getUTCFullYear()), tone: "plain" });
	}
	return facts.slice(0, MAX_FACTS);
}
