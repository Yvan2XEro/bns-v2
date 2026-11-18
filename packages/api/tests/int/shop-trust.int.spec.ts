// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	isNewShop,
	RESPONSE_TIME_SAMPLE_FLOOR,
	type ShopTrust,
	shopResponseTimeOf,
	shopTrustItems,
} from "../../src/contracts/shopTrust";
import { serializePublicShop } from "../../src/lib/publicShop";
import type { Shop } from "../../src/payload-types";
import { recomputeShopRankings } from "../../src/services/shopRanking";
import { responseDelaysSince } from "../../src/services/shopResponseBursts";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const daysAgo = (days: number) =>
	new Date(NOW.getTime() - days * 86_400_000).toISOString();
const five = (minutes: number) => Array(5).fill(minutes) as number[];

describe("shopResponseTimeOf", () => {
	it("buckets the median reply delay", () => {
		expect(shopResponseTimeOf(five(10))).toBe("under_1h");
		expect(shopResponseTimeOf(five(60))).toBe("under_1h");
		expect(shopResponseTimeOf(five(61))).toBe("under_3h");
		expect(shopResponseTimeOf(five(180))).toBe("under_3h");
		expect(shopResponseTimeOf(five(181))).toBe("same_day");
		expect(shopResponseTimeOf(five(24 * 60))).toBe("same_day");
		expect(shopResponseTimeOf(five(24 * 60 + 1))).toBe("few_days");
	});

	it("is null below the sample floor", () => {
		expect(
			shopResponseTimeOf(Array(RESPONSE_TIME_SAMPLE_FLOOR - 1).fill(5)),
		).toBeNull();
		expect(shopResponseTimeOf([])).toBeNull();
	});

	it("lets unanswered bursts pull the median up", () => {
		const inf = Number.POSITIVE_INFINITY;
		expect(shopResponseTimeOf([5, 5, inf, inf, inf])).toBe("few_days");
		expect(shopResponseTimeOf([5, 5, 5, inf, inf])).toBe("under_1h");
	});
});

describe("responseDelaysSince", () => {
	const message = (
		conversationId: string,
		senderSide: "buyer" | "shop",
		at: string,
	) => ({ conversationId, senderSide, createdAt: at });

	it("keeps window bursts, counts expired silence and skips open ones", () => {
		const delays = responseDelaysSince(
			[
				message("c1", "buyer", "2026-10-10T10:00:00.000Z"),
				message("c1", "shop", "2026-10-10T10:30:00.000Z"),
				message("c2", "buyer", "2026-10-11T10:00:00.000Z"),
				message("c3", "buyer", "2026-10-15T11:00:00.000Z"),
				message("c4", "buyer", "2026-08-01T10:00:00.000Z"),
				message("c4", "shop", "2026-08-01T10:05:00.000Z"),
			],
			new Date(daysAgo(30)),
			NOW,
		);
		expect(delays.sort()).toEqual([30, Number.POSITIVE_INFINITY]);
	});
});

describe("isNewShop", () => {
	it("is new under 30 days, or under 90 days without a review", () => {
		expect(isNewShop(daysAgo(10), 12, NOW)).toBe(true);
		expect(isNewShop(daysAgo(45), 0, NOW)).toBe(true);
		expect(isNewShop(daysAgo(45), 1, NOW)).toBe(false);
		expect(isNewShop(daysAgo(120), 0, NOW)).toBe(false);
		expect(isNewShop("not a date", 0, NOW)).toBe(false);
	});
});

describe("shopTrustItems", () => {
	const trust = (patch: Partial<ShopTrust> = {}): ShopTrust => ({
		responseTime: "under_1h",
		activeListings: 12,
		memberSince: "2024-03-01T00:00:00.000Z",
		isNew: false,
		...patch,
	});

	it("lists every meaningful stat in order", () => {
		expect(
			shopTrustItems({
				trust: trust(),
				city: "Ville",
				rating: { value: 4.7, count: 38 },
			}),
		).toEqual([
			{ kind: "rating", rating: 4.7, count: 38 },
			{ kind: "responseTime", bucket: "under_1h" },
			{ kind: "city", city: "Ville" },
			{ kind: "memberSince", year: 2024 },
			{ kind: "activeListings", count: 12 },
		]);
	});

	it("never shows a zero or empty stat", () => {
		const items = shopTrustItems({
			trust: trust({ responseTime: null, activeListings: 0 }),
			city: "  ",
			rating: { value: 0, count: 0 },
		});
		expect(items).toEqual([{ kind: "memberSince", year: 2024 }]);
	});

	it("shows « Nouvelle boutique » in place of the year for a new shop", () => {
		expect(
			shopTrustItems({
				trust: trust({ isNew: true, responseTime: null, activeListings: 0 }),
				city: null,
				rating: null,
			}),
		).toEqual([{ kind: "newShop" }]);
	});
});

describe("public shop shape", () => {
	it("carries trust and the return policy", () => {
		const shop = {
			id: "s-1",
			handle: "s-1",
			name: "Shop",
			publishedListingCount: 7,
			totalReviews: 3,
			createdAt: "2024-01-01T00:00:00.000Z",
			returnPolicy: "  Retour sous 7 jours  ",
			trustStats: { responseTime: "under_3h", responseSample: 9 },
		} as unknown as Shop;
		const result = serializePublicShop(shop, null);
		expect(result.trust).toEqual({
			responseTime: "under_3h",
			activeListings: 7,
			memberSince: "2024-01-01T00:00:00.000Z",
			isNew: false,
		});
		expect(result.returnPolicy).toBe("Retour sous 7 jours");
		const bare = serializePublicShop(
			{ ...shop, trustStats: undefined, returnPolicy: "" } as Shop,
			null,
		);
		expect(bare.trust.responseTime).toBeNull();
		expect(bare.returnPolicy).toBeNull();
	});
});

describe("recomputeShopRankings response time", () => {
	it("stores the bucket from the last 30 days of messages", async () => {
		const conversations = Array.from({ length: 5 }, (_, index) => ({
			id: `c-${index}`,
			shop: "s-1",
			lastMessageAt: daysAgo(2),
		}));
		const messages = conversations.flatMap((conversation, index) => [
			{
				id: `m-${index}-b`,
				conversation: conversation.id,
				senderSide: "buyer",
				createdAt: "2026-10-12T08:00:00.000Z",
			},
			{
				id: `m-${index}-s`,
				conversation: conversation.id,
				senderSide: "shop",
				createdAt: "2026-10-12T09:30:00.000Z",
			},
		]);
		const payload = fakePayload({
			shops: [{ id: "s-1", status: "active", level: 2 }],
			conversations,
			messages,
		});
		const first = await recomputeShopRankings(payload, NOW);
		expect(first.updated).toBe(1);
		const stored = payload.store.shops.find((doc) => doc.id === "s-1");
		expect(stored?.trustStats).toMatchObject({
			responseTime: "under_3h",
			responseSample: 5,
		});
	});
});
