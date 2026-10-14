import type { MongooseAdapter } from "@payloadcms/db-mongodb";
import type { Payload } from "payload";

export const REVIEW_UNIQUE_INDEX = "reviewer_1_reviewedUser_1_shop_1_unique";
const LEGACY_INDEX = "reviewer_1_reviewedUser_1_unique";

export interface ReviewDuplicateGroup {
	reviewer: string;
	reviewedUser: string;
	shop: string | null;
	reviewIds: string[];
}

/** The slice of the driver collection this needs. */
export type ReviewsCollection = Pick<
	MongooseAdapter["collections"][string]["collection"],
	"aggregate" | "createIndex" | "dropIndex"
>;

export function reviewsCollection(payload: Payload): ReviewsCollection {
	return (payload.db as unknown as MongooseAdapter).collections.reviews
		.collection;
}

/**
 * Rows the unique index would refuse: the same reviewer, reviewed user and
 * shop more than once. A missing `shop` counts as `null`, as the index does.
 */
export async function findReviewDuplicates(
	collection: ReviewsCollection,
): Promise<ReviewDuplicateGroup[]> {
	const rows = (await collection
		.aggregate([
			{
				$group: {
					_id: {
						reviewer: "$reviewer",
						reviewedUser: "$reviewedUser",
						shop: { $ifNull: ["$shop", null] },
					},
					ids: { $push: "$_id" },
					count: { $sum: 1 },
				},
			},
			{ $match: { count: { $gt: 1 } } },
		])
		.toArray()) as Array<{
		_id: { reviewer: unknown; reviewedUser: unknown; shop: unknown };
		ids: unknown[];
	}>;
	return rows.map((row) => ({
		reviewer: String(row._id.reviewer),
		reviewedUser: String(row._id.reviewedUser),
		shop: row._id.shop == null ? null : String(row._id.shop),
		reviewIds: row.ids.map(String),
	}));
}

/**
 * Creates the (reviewer, reviewedUser, shop) unique index unless duplicates
 * already exist — then it builds nothing and returns them. Duplicates predate
 * the rule and are staff's call, not a deploy's: the application checks still
 * refuse new ones meanwhile. Idempotent.
 */
export async function ensureReviewUniqueIndex(
	collection: ReviewsCollection,
): Promise<{ created: boolean; duplicates: ReviewDuplicateGroup[] }> {
	const duplicates = await findReviewDuplicates(collection);
	if (duplicates.length > 0) return { created: false, duplicates };
	await collection.dropIndex(LEGACY_INDEX).catch(() => undefined);
	await collection.createIndex(
		{ reviewer: 1, reviewedUser: 1, shop: 1 },
		{ unique: true, name: REVIEW_UNIQUE_INDEX },
	);
	return { created: true, duplicates: [] };
}
