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
		// Skipped, not thrown: duplicates are the state every pre-P0 database is
		// in, and blocking a deploy on data that predates this branch costs more
		// than the race it closes. error, not warn: this environment is running,
		// and will keep running, without the database-level guard. The
		// application-level checks (enforceReviewRules, translateReviewWriteConflicts)
		// still apply, but the race between two concurrent creates stays open
		// until staff resolve these groups and this migration runs again — which
		// needs this migration's row deleted from `payload-migrations` by hand.
		payload.logger.error({
			msg: "[migration] duplicate reviews kept for staff review; the unique (reviewer, reviewedUser) index was NOT created — recovery steps: docs/superpowers/plans/2026-09-15-p0-verification.md, 'Reviews unique index: recovery after a skipped migration'",
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
