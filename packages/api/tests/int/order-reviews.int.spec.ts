// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

vi.mock("payload", () => ({
	APIError: class APIError extends Error {
		constructor(
			message: string,
			public status: number,
			public data: unknown,
			public isPublic: boolean,
		) {
			super(message);
		}
	},
}));

let enforceReviewRules: (args: any) => Promise<any>;
let updateShopRating: (req: any, shopId: string) => Promise<void>;
let updateUserRating: (args: any) => Promise<void>;
beforeAll(async () => {
	({ enforceReviewRules, updateShopRating, updateUserRating } = await import(
		"../../src/hooks/reviews"
	));
});

const BUYER = "buyer";
const OTHER_BUYER = "other-buyer";
const OWNER = "owner";
const SHOP = "shop-1";

function world(seed: Record<string, any[]> = {}) {
	return fakePayload({
		reviews: [],
		orders: [],
		shops: [{ id: SHOP, owner: OWNER }],
		...seed,
	});
}

function orderWith(status: string, overrides: Record<string, unknown> = {}) {
	return {
		id: `order-${status}`,
		buyer: BUYER,
		shop: SHOP,
		status,
		...overrides,
	};
}

async function submitOrderReview(
	payload: ReturnType<typeof world>,
	orderId: string,
	reviewerId: string,
	extra: Record<string, unknown> = {},
) {
	return enforceReviewRules({
		operation: "create",
		data: { order: orderId, rating: 5, ...extra },
		req: { user: { id: reviewerId }, payload },
	});
}

describe("enforceReviewRules: the order review path", () => {
	it("accepts a review with an orderId when the caller is the buyer and the order is delivered", async () => {
		const payload = world({ orders: [orderWith("delivered")] });
		const data = await submitOrderReview(payload, "order-delivered", BUYER);
		expect(data).toMatchObject({
			order: "order-delivered",
			shop: SHOP,
			reviewedUser: OWNER,
			verifiedPurchase: true,
			reviewer: BUYER,
		});
	});

	it("accepts it on a completed order", async () => {
		const payload = world({ orders: [orderWith("completed")] });
		const data = await submitOrderReview(payload, "order-completed", BUYER);
		expect(data).toMatchObject({
			shop: SHOP,
			reviewedUser: OWNER,
			verifiedPurchase: true,
		});
	});

	// A4: every status other than `delivered`/`completed` is refused. Looping
	// every other row of `ORDER_STATUSES` (rather than picking one, e.g.
	// `shipped`) is what proves there is no off-by-one in the allow-list.
	const NON_REVIEWABLE_STATUSES = [
		"placed",
		"confirmed",
		"paid",
		"accepted",
		"shipped",
		"cancelled",
		"delivery_failed",
		"returned",
		"disputed",
	];

	it.each(
		NON_REVIEWABLE_STATUSES,
	)("refuses it when the order is %s", async (status) => {
		const payload = world({ orders: [orderWith(status)] });
		await expect(
			submitOrderReview(payload, `order-${status}`, BUYER),
		).rejects.toMatchObject({
			status: 403,
			data: { code: "review.noInteraction" },
		});
	});

	it("refuses another user's order with review.noInteraction", async () => {
		const payload = world({ orders: [orderWith("delivered")] });
		await expect(
			submitOrderReview(payload, "order-delivered", OTHER_BUYER),
		).rejects.toMatchObject({
			status: 403,
			data: { code: "review.noInteraction" },
		});
	});

	it("ignores a client-sent verifiedPurchase", async () => {
		const payload = world({ orders: [orderWith("delivered")] });
		const data = await submitOrderReview(payload, "order-delivered", BUYER, {
			verifiedPurchase: false,
		});
		expect(data.verifiedPurchase).toBe(true);
	});

	it("ignores a client-sent shop", async () => {
		const payload = world({
			orders: [orderWith("delivered")],
			shops: [
				{ id: SHOP, owner: OWNER },
				{ id: "shop-2", owner: "someone-else" },
			],
		});
		const data = await submitOrderReview(payload, "order-delivered", BUYER, {
			shop: "shop-2",
		});
		expect(data.shop).toBe(SHOP);
	});

	it("ignores a client-sent reviewedUser", async () => {
		const payload = world({ orders: [orderWith("delivered")] });
		const data = await submitOrderReview(payload, "order-delivered", BUYER, {
			reviewedUser: "someone-else",
		});
		expect(data.reviewedUser).toBe(OWNER);
	});

	it("sets reviewedUser to the shop owner", async () => {
		const payload = world({ orders: [orderWith("delivered")] });
		const data = await submitOrderReview(payload, "order-delivered", BUYER);
		expect(data.reviewedUser).toBe(OWNER);
	});

	it("refuses a second review of the same shop with review.duplicate, and the shop keeps exactly one review", async () => {
		const payload = world({
			orders: [
				orderWith("delivered"),
				orderWith("delivered", { id: "order-delivered-2" }),
			],
			reviews: [
				{
					id: "r-1",
					reviewer: BUYER,
					reviewedUser: OWNER,
					shop: SHOP,
					rating: 5,
				},
			],
		});
		await expect(
			submitOrderReview(payload, "order-delivered-2", BUYER),
		).rejects.toMatchObject({
			status: 409,
			data: { code: "review.duplicate" },
		});
		// Counting rows, not the rejection alone: a swallowed duplicate and a
		// refused one both leave the second `submitOrderReview` looking
		// "handled" from the caller's side, but only a refused one leaves the
		// shop with exactly one review row.
		expect(
			payload.store.reviews.filter(
				(review: any) => review.reviewer === BUYER && review.shop === SHOP,
			),
		).toHaveLength(1);
	});

	it("a review cannot be moved onto a different order afterwards", async () => {
		const data = await enforceReviewRules({
			operation: "update",
			originalDoc: { order: "order-a", shop: SHOP, reviewedUser: OWNER },
			data: { order: "order-b" },
			req: { user: { id: BUYER }, payload: world() },
		});
		expect(data.order).toBe("order-a");
	});
});

/** Attaches a stub raw-driver `aggregate` to the fake's `db`, the way the
 * real mongodb adapter's `.collections.reviews.collection` is reached. */
function withAggregateStub(
	payload: ReturnType<typeof world>,
	rows: Array<{ average: number; count: number }>,
) {
	const aggregate = vi.fn((_pipeline: Record<string, unknown>[]) => ({
		toArray: async () => rows,
	}));
	(
		payload.db as unknown as { collections: Record<string, unknown> }
	).collections = { reviews: { collection: { aggregate } } };
	return aggregate;
}

describe("updateShopRating", () => {
	it("recomputes shops.rating/totalReviews from the aggregation result", async () => {
		const payload = world({
			shops: [{ id: SHOP, owner: OWNER, rating: 0, totalReviews: 0 }],
		});
		withAggregateStub(payload, [{ average: 4.5, count: 3 }]);

		await updateShopRating({ payload }, SHOP);

		const shop = payload.store.shops.find((s: any) => s.id === SHOP);
		expect(shop).toMatchObject({ rating: 4.5, totalReviews: 3 });
	});

	it("resets to zero when no row comes back (the shop's last review was removed)", async () => {
		const payload = world({
			shops: [{ id: SHOP, owner: OWNER, rating: 4.5, totalReviews: 3 }],
		});
		withAggregateStub(payload, []);

		await updateShopRating({ payload }, SHOP);

		const shop = payload.store.shops.find((s: any) => s.id === SHOP);
		expect(shop).toMatchObject({ rating: 0, totalReviews: 0 });
	});

	it("the aggregation does not use limit: 1000 — it is a pipeline scoped to this shop only", async () => {
		const payload = world();
		const aggregate = withAggregateStub(payload, [{ average: 5, count: 1 }]);

		await updateShopRating({ payload }, SHOP);

		expect(aggregate).toHaveBeenCalledTimes(1);
		const pipeline = aggregate.mock.calls[0][0];
		expect(pipeline).toEqual([
			{ $match: { shop: SHOP } },
			{
				$group: {
					_id: null,
					average: { $avg: "$rating" },
					count: { $sum: 1 },
				},
			},
		]);
		expect(pipeline.some((stage) => "$limit" in stage)).toBe(false);
	});
});

describe("updateUserRating excludes shop reviews", () => {
	it("the owner's personal rating excludes shop reviews", async () => {
		const payload = world({
			reviews: [
				{
					id: "r-shop",
					reviewer: BUYER,
					reviewedUser: OWNER,
					shop: SHOP,
					rating: 5,
				},
				{
					id: "r-personal",
					reviewer: OTHER_BUYER,
					reviewedUser: OWNER,
					rating: 1,
				},
			],
			users: [{ id: OWNER, rating: 0, totalReviews: 0 }],
		});

		await updateUserRating({ req: { payload }, reviewedUserId: OWNER });

		// If the shop review leaked in, averaging 5 and 1 would read 3; if it
		// were the only one counted, it would read 5. Reading exactly 1 proves
		// it was excluded, not merely outweighed.
		const owner = payload.store.users.find((u: any) => u.id === OWNER);
		expect(owner).toMatchObject({ rating: 1, totalReviews: 1 });
	});
});
