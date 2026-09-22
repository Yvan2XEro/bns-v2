import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";
import { auditLegacyReviews } from "../services/reviewAudit";

const INDEX_NAME = "reviewer_1_reviewedUser_1_unique";

const reviewsCollection = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections.reviews.collection;

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
	const audit = await auditLegacyReviews(payload, req);

	if (audit.selfReviewIds.length > 0) {
		payload.logger.warn({
			msg: "[migration] self-reviews kept for staff review",
			reviewIds: audit.selfReviewIds,
		});
	}
	if (audit.duplicateGroups.length > 0) {
		// error, not warn: this environment is running, and will keep running,
		// without the database-level guard against a duplicate review. The
		// application-level checks (enforceReviewRules, translateReviewWriteConflicts)
		// still apply, but the race between two concurrent creates stays open
		// until staff resolve these groups and this migration runs again.
		payload.logger.error({
			msg: "[migration] duplicate reviews kept for staff review; the unique (reviewer, reviewedUser) index was NOT created — re-run this migration once they are resolved",
			groups: audit.duplicateGroups,
		});
		return;
	}

	await reviewsCollection(payload).createIndex(
		{ reviewer: 1, reviewedUser: 1 },
		{ unique: true, name: INDEX_NAME },
	);
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await reviewsCollection(payload)
		.dropIndex(INDEX_NAME)
		.catch(() => undefined);
}
