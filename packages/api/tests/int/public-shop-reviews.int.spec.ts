// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SHOP_REVIEWS_PAGE_SIZE } from "../../src/contracts/publicShopReviews";
import { publicShopReviews } from "../../src/services/shopReviews";
import { fakePayload } from "./helpers/fakePayload";

const shop = { id: "shop-1", status: "active" };

function review(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		shop: shop.id,
		reviewer: "buyer-1",
		reviewedUser: "owner-1",
		order: `order-${id}`,
		listing: "listing-1",
		status: "published",
		verifiedPurchase: true,
		rating: 5,
		comment: "Très bien",
		createdAt: `2026-10-0${id.length}T10:00:00.000Z`,
		...overrides,
	};
}

describe("public shop reviews", () => {
	it("lists only published verified-purchase reviews of that shop, with a first name only", async () => {
		const payload = fakePayload({
			shops: [shop],
			users: [
				{ id: "buyer-1", name: "Aïcha Ngono Mballa", email: "a@x.cm" },
				{ id: "buyer-2", name: "Paul", email: "p@x.cm" },
			],
			reviews: [
				review("r1", { createdAt: "2026-10-01T10:00:00.000Z" }),
				review("r2", {
					reviewer: "buyer-2",
					rating: 3,
					comment: "  ",
					createdAt: "2026-10-03T10:00:00.000Z",
				}),
				review("r3", { status: "held_dispute" }),
				review("r4", { verifiedPurchase: false }),
				review("r5", { shop: "shop-other" }),
			],
		});

		const result = await publicShopReviews(payload, shop.id, 1);

		expect(result).toEqual({
			reviews: [
				{
					id: "r2",
					rating: 3,
					comment: null,
					createdAt: "2026-10-03T10:00:00.000Z",
					reviewerFirstName: "Paul",
				},
				{
					id: "r1",
					rating: 5,
					comment: "Très bien",
					createdAt: "2026-10-01T10:00:00.000Z",
					reviewerFirstName: "Aïcha",
				},
			],
			page: 1,
			totalPages: 1,
			total: 2,
		});
		expect(JSON.stringify(result)).not.toMatch(/buyer-|order-|@x\.cm|Ngono/);
	});

	it("pages by the fixed page size", async () => {
		const reviews = Array.from({ length: SHOP_REVIEWS_PAGE_SIZE + 2 }, (_, i) =>
			review(`r${i}`, {
				createdAt: new Date(Date.UTC(2026, 9, 1, i)).toISOString(),
			}),
		);
		const payload = fakePayload({
			shops: [shop],
			users: [{ id: "buyer-1", name: "Aïcha" }],
			reviews,
		});

		const second = await publicShopReviews(payload, shop.id, 2);

		expect(second.page).toBe(2);
		expect(second.totalPages).toBe(2);
		expect(second.total).toBe(SHOP_REVIEWS_PAGE_SIZE + 2);
		expect(second.reviews.map((r) => r.id)).toEqual(["r1", "r0"]);
	});

	it("is a 404 for an unknown or closed shop", async () => {
		const payload = fakePayload({
			shops: [{ id: "shop-closed", status: "closed" }],
		});
		await expect(
			publicShopReviews(payload, "shop-closed", 1),
		).rejects.toMatchObject({ status: 404 });
		await expect(
			publicShopReviews(payload, "missing", 1),
		).rejects.toMatchObject({ status: 404 });
	});
});
