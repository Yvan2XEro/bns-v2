import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const INDEX_NAME = "listing_view_flushes_listing_date";
const collection = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections["listing-view-flushes"]
		.collection;

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const raw = collection(payload);
	await raw.createIndex(
		{ listing: 1, date: 1 },
		{ unique: true, name: INDEX_NAME },
	);
	await raw.createIndex(
		{ purgeAt: 1 },
		{ expireAfterSeconds: 0, name: "listing_view_flushes_purge_at" },
	);
	payload.logger.info({
		msg: "[migration] P9: idempotent listing-view flushes with bounded retention",
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	const raw = collection(payload);
	await raw.dropIndex(INDEX_NAME).catch(() => undefined);
	await raw.dropIndex("listing_view_flushes_purge_at").catch(() => undefined);
}
