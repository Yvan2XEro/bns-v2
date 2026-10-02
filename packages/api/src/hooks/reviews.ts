import { ObjectId } from "bson";
import type {
	CollectionAfterErrorHook,
	CollectionBeforeChangeHook,
} from "payload";
import { relationId } from "../lib/relationId";
import { CodedAPIError } from "../lib/serviceError";
import {
	assertOrderReviewAllowed,
	assertReviewAllowed,
	findOrderReviewTarget,
	ReviewRuleError,
	translateReviewWriteConflict,
} from "../services/reviewRules";

/**
 * The reviewer is whoever is signed in, never what the client sent. Writes
 * without a user (seed, scripts) are trusted and skip the rules. A client
 * supplying `order` picks the verified-purchase path: `shop`, `reviewedUser`
 * and `verifiedPurchase` are then resolved from the order itself and any
 * client-sent value for them is discarded, never merely checked.
 */
export const enforceReviewRules: CollectionBeforeChangeHook = async ({
	data,
	operation,
	originalDoc,
	req,
}) => {
	if (operation === "update") {
		// `order` is permanent once a review carries one: letting an update
		// retarget it would move `verifiedPurchase` onto a different purchase
		// without ever re-running the check below that earned it.
		if (originalDoc && "order" in data) {
			data.order = originalDoc.order;
		}
		return data;
	}

	if (operation !== "create" || !req.user) return data;

	data.reviewer = req.user.id;

	const orderId = relationId(data.order);
	if (orderId) {
		try {
			const target = await assertOrderReviewAllowed(
				req.payload,
				{ reviewerId: String(req.user.id), orderId },
				req,
			);
			data.shop = target.shop;
			data.reviewedUser = target.reviewedUser;
			data.verifiedPurchase = true;
		} catch (error) {
			if (error instanceof ReviewRuleError) {
				throw new CodedAPIError(error.code, error.status);
			}
			throw error;
		}
		return data;
	}

	// Not an order review: a client can never attach a shop to a review this
	// way. `verifiedPurchase` already defaults to false via its own field
	// access (Reviews.ts).
	data.shop = null;

	const reviewedUserId = relationId(data.reviewedUser);
	if (!reviewedUserId) return data;

	try {
		await assertReviewAllowed(
			req.payload,
			{ reviewerId: String(req.user.id), reviewedUserId },
			req,
		);
	} catch (error) {
		if (error instanceof ReviewRuleError) {
			throw new CodedAPIError(error.code, error.status);
		}
		throw error;
	}
	return data;
};

/**
 * Two creates can both pass `enforceReviewRules`'s pre-check before either is
 * written; the database's unique index then rejects the loser. Payload
 * surfaces that as a raw write error here, after the request has already
 * failed — this only rewrites the response so the caller sees the same
 * review.duplicate the pre-check would have produced. An order-review loser
 * carries no `reviewedUser`/`shop` in its original request body (those are
 * server-resolved), so this re-resolves them from `order` the same way
 * `assertOrderReviewAllowed` did for the winner.
 */
export const translateReviewWriteConflicts: CollectionAfterErrorHook = async ({
	error,
	req,
}) => {
	if (!req.user) return;

	const orderId = relationId(req.data?.order);
	let reviewedUserId: string | null;
	let shop: string | undefined;

	if (orderId) {
		const resolved = await findOrderReviewTarget(
			req.payload,
			orderId,
			req,
		).catch(() => null);
		if (!resolved?.target) return;
		reviewedUserId = resolved.target.reviewedUser;
		shop = resolved.target.shop;
	} else {
		reviewedUserId = relationId(req.data?.reviewedUser);
	}
	if (!reviewedUserId) return;

	const conflict = await translateReviewWriteConflict(
		req.payload,
		{ reviewerId: String(req.user.id), reviewedUserId, shop },
		error,
		req,
	);
	if (!conflict) return;

	return {
		status: conflict.status,
		response: {
			errors: [
				{
					name: conflict.name,
					message: conflict.message,
					data: { code: conflict.code },
				},
			],
		},
	};
};

export const updateUserRating = async ({
	req,
	reviewedUserId,
}: {
	req: { payload: unknown };
	reviewedUserId: string;
}) => {
	const payload = req.payload as {
		find: (options: {
			collection: string;
			where: Record<string, unknown>;
			limit?: number;
		}) => Promise<{ docs: Array<{ rating: number }> }>;
		update: (options: {
			collection: string;
			id: string;
			overrideAccess?: boolean;
			context?: Record<string, unknown>;
			data: Record<string, unknown>;
		}) => Promise<unknown>;
	};

	const reviews = await payload.find({
		collection: "reviews",
		where: {
			and: [
				{ reviewedUser: { equals: reviewedUserId } },
				// A shop review is counted into `shops.rating` by
				// `updateShopRating` instead; without this filter a shop owner's
				// personal rating would move every time one of their own shop's
				// reviews is created or deleted.
				{ shop: { exists: false } },
			],
		},
		limit: 1000,
	});

	if (reviews.docs.length === 0) {
		await payload.update({
			collection: "users",
			id: reviewedUserId,
			overrideAccess: true,
			context: { ratingUpdate: true },
			data: {
				rating: 0,
				totalReviews: 0,
			},
		});
		return;
	}

	const totalRating = reviews.docs.reduce(
		(sum, review) => sum + (review.rating || 0),
		0,
	);
	const averageRating = totalRating / reviews.docs.length;

	await payload.update({
		collection: "users",
		id: reviewedUserId,
		overrideAccess: true,
		context: { ratingUpdate: true },
		data: {
			rating: Math.round(averageRating * 10) / 10,
			totalReviews: reviews.docs.length,
		},
	});
};

/**
 * Converts a Payload relationship id into the form the raw Mongo driver
 * expects in an aggregation `$match`. Production ids are 24-hex ObjectIds
 * and always convert; test doubles use plain string ids (`"shop-1"`), which
 * `ObjectId` rejects — the fallback keeps those call sites testable without
 * a real driver underneath.
 */
function toStoredId(id: string): unknown {
	try {
		return new ObjectId(id);
	} catch {
		return id;
	}
}

interface ShopRatingPayload {
	db: {
		collections: {
			reviews: {
				collection: {
					aggregate: (pipeline: Record<string, unknown>[]) => {
						toArray: () => Promise<Array<{ average: number; count: number }>>;
					};
				};
			};
		};
	};
	update: (options: {
		collection: string;
		id: string;
		overrideAccess?: boolean;
		context?: Record<string, unknown>;
		data: Record<string, unknown>;
	}) => Promise<unknown>;
}

/**
 * Recomputes `shops.rating`/`totalReviews` from the review rows themselves,
 * via an aggregation pipeline, rather than incrementing a counter on every
 * write: an increment that is only ever adjusted can drift from the rows it
 * summarises — a lost event, a direct admin edit, a review deleted through a
 * path that forgets to reverse it — while a value recomputed from the source
 * cannot. The pipeline also replaces the P0 `find(...).limit(1000)` that
 * silently truncated past a thousand reviews; an aggregation has no such
 * cap.
 */
export const updateShopRating = async (
	req: { payload: unknown },
	shopId: string,
): Promise<void> => {
	const payload = req.payload as ShopRatingPayload;

	const pipeline: Record<string, unknown>[] = [
		{ $match: { shop: toStoredId(shopId) } },
		{
			$group: {
				_id: null,
				average: { $avg: "$rating" },
				count: { $sum: 1 },
			},
		},
	];
	const [row] = await payload.db.collections.reviews.collection
		.aggregate(pipeline)
		.toArray();

	await payload.update({
		collection: "shops",
		id: shopId,
		overrideAccess: true,
		context: { ratingUpdate: true },
		data: {
			rating: row ? Math.round(row.average * 10) / 10 : 0,
			totalReviews: row ? row.count : 0,
		},
	});
};
