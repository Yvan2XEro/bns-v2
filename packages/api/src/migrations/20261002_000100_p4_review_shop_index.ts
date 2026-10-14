import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";
import { ensureReviewUniqueIndex } from "../services/reviewUniqueIndex";

const OLD_INDEX_NAME = "reviewer_1_reviewedUser_1_unique";
const INDEX_NAME = "reviewer_1_reviewedUser_1_shop_1_unique";

const reviewsCollection = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections.reviews.collection;

/**
 * P0's index only ever covered `(reviewer, reviewedUser)`, so the same pair
 * could never collide twice — including once for a personal review and once
 * for a shop the reviewedUser happens to own. Adding `shop` lets those
 * coexist: the pair now collides only when `shop` also matches. The null
 * case is unchanged on purpose — MongoDB's unique index treats a missing
 * `shop` as `null`, and a non-sparse index still enforces uniqueness among
 * nulls, so two personal reviews of the same pair still collide exactly as
 * they did under P0's two-field index.
 *
 * Idempotent: dropping an index that is already gone, or creating one that
 * already exists with the same key and name, is a no-op on both ends, so a
 * second `up()` run never throws. Existing duplicates skip the build instead
 * of failing the deploy — see `services/reviewUniqueIndex.ts`.
 */
export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const { created, duplicates } = await ensureReviewUniqueIndex(
		reviewsCollection(payload),
	);
	if (!created) {
		// Never blocks the deploy: the boot task "review-unique-index" builds
		// the index on the first start after staff have resolved these.
		payload.logger.error({
			msg: "[migration] duplicate reviews kept for staff review; the unique (reviewer, reviewedUser, shop) index is created at the next start once they are resolved",
			groups: duplicates,
		});
		return;
	}
	payload.logger.info({
		msg: "[migration] reviews unique index widened to (reviewer, reviewedUser, shop)",
		index: INDEX_NAME,
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	const collection = reviewsCollection(payload);

	await collection.dropIndex(INDEX_NAME).catch(() => undefined);

	await collection.createIndex(
		{ reviewer: 1, reviewedUser: 1 },
		{ unique: true, name: OLD_INDEX_NAME },
	);
}
