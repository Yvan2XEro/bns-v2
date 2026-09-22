import type {
	CollectionAfterErrorHook,
	CollectionBeforeChangeHook,
} from "payload";
import { APIError } from "payload";
import { relationId } from "../lib/relationId";
import {
	assertReviewAllowed,
	ReviewRuleError,
	translateReviewWriteConflict,
} from "../services/reviewRules";

/**
 * The reviewer is whoever is signed in, never what the client sent. Writes
 * without a user (seed, scripts) are trusted and skip the rules.
 */
export const enforceReviewRules: CollectionBeforeChangeHook = async ({
	data,
	operation,
	req,
}) => {
	if (operation !== "create" || !req.user) return data;

	data.reviewer = req.user.id;
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
			throw new APIError(
				error.message,
				error.status,
				{ code: error.code },
				true,
			);
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
 * review.duplicate the pre-check would have produced.
 */
export const translateReviewWriteConflicts: CollectionAfterErrorHook = async ({
	error,
	req,
}) => {
	if (!req.user) return;
	const reviewedUserId = relationId(req.data?.reviewedUser);
	if (!reviewedUserId) return;

	const conflict = await translateReviewWriteConflict(
		req.payload,
		{ reviewerId: String(req.user.id), reviewedUserId },
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
			reviewedUser: { equals: reviewedUserId },
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
