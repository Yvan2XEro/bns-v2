import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const sessions = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections["stock-count-sessions"]
		.collection;

export const OPEN_STOCK_COUNT_INDEX = "stock_count_sessions_one_open_per_shop";

/**
 * One open stock count per shop. Extra open sessions left by the race this
 * index closes were never shown (the overview reads the newest), so all but
 * the newest are cancelled before the index is built.
 */
export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const collection = sessions(payload);
	const groups = await collection
		.aggregate([
			{ $match: { status: "open" } },
			{ $sort: { startedAt: -1 } },
			{ $group: { _id: "$shop", ids: { $push: "$_id" } } },
			{ $match: { "ids.1": { $exists: true } } },
		])
		.toArray();
	const extras = groups.flatMap((group) => (group.ids as unknown[]).slice(1));
	if (extras.length > 0) {
		const filter: Record<string, unknown> = { _id: { $in: extras } };
		await collection.updateMany(filter, {
			$set: { status: "cancelled", updatedAt: new Date() },
		});
		payload.logger.warn({
			msg: "[migration] cancelled duplicate open stock counts",
			sessionIds: extras.map(String),
		});
	}
	await collection.createIndex(
		{ shop: 1 },
		{
			unique: true,
			name: OPEN_STOCK_COUNT_INDEX,
			partialFilterExpression: { status: "open" },
		},
	);
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await sessions(payload)
		.dropIndex(OPEN_STOCK_COUNT_INDEX)
		.catch(() => undefined);
}
