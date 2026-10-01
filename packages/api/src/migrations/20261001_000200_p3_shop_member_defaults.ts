import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const members = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections["shop-members"]
		.collection;

/**
 * `joinedAt` and `inboxNotifications` are new on this collection, and
 * `inboxNotifications` is now `required`. Payload's `defaultValue` only
 * applies on a document the API creates from here on, so the owner rows P1
 * wrote before this field existed carry neither — on real data this should
 * only ever be the owner rows `createShop` wrote, since Task 9 is the first
 * writer of any other row and lands after this migration.
 *
 * `joinedAt` backfills from `createdAt`: the owner's membership began when
 * the shop was created, so that is the truthful join date, not "now".
 */
export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const collection = members(payload);
	const rows = await collection.find({}).toArray();

	let joinedAtBackfilled = 0;
	for (const row of rows) {
		if (row.joinedAt != null) continue;
		await collection.updateOne(
			{ _id: row._id },
			{ $set: { joinedAt: row.createdAt } },
		);
		joinedAtBackfilled += 1;
	}

	let inboxNotificationsBackfilled = 0;
	for (const row of rows) {
		if (row.inboxNotifications != null) continue;
		await collection.updateOne(
			{ _id: row._id },
			{ $set: { inboxNotifications: "all" } },
		);
		inboxNotificationsBackfilled += 1;
	}

	payload.logger.info({
		msg: "[migration] backfilled shop-members.joinedAt and shop-members.inboxNotifications on rows written before P3",
		joinedAtBackfilled,
		inboxNotificationsBackfilled,
	});
}

export async function down(_args: MigrateDownArgs): Promise<void> {
	// Not reversible: a row written before P3 is indistinguishable from one
	// this migration backfilled, the same way `20261001_000100_p3_shop_listing_seller`
	// cannot tell a listing's original seller apart once overwritten.
}
