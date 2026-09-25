import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";
import { backfillContactRevealWindows } from "../services/contactRevealBackfill";

const contactRevealsCollection = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections["contact-reveals"]
		.collection;

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
	const result = await backfillContactRevealWindows(payload, { req });
	payload.logger.info({
		msg: "[migration] contact reveal windows backfilled",
		...result,
	});
	if (result.removed > 0) {
		payload.logger.warn({
			msg: "[migration] duplicate contact reveals removed; the earliest row of each group was kept",
			removed: result.removed,
		});
	}

	// Built here from clean data, with Mongo's default name, so it is the same
	// index the collection config declares and creating it twice is a no-op.
	await contactRevealsCollection(payload).createIndex(
		{ viewer: 1, listing: 1, revealWindow: 1 },
		{ unique: true },
	);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
	// Nothing to undo: the removed rows are duplicate audit entries and cannot
	// be restored, and the unique index is declared on the collection, so
	// dropping it here would only be undone at the next boot.
}
