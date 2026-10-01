import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const collection = (payload: MigrateUpArgs["payload"], slug: string) =>
	(payload.db as unknown as MongooseAdapter).collections[slug].collection;

/**
 * Brings existing data in line with the rule the hook now enforces. With
 * owner-only memberships in P1 this should find nothing; it exists because
 * "should find nothing" is a belief, and a listing whose seller is a former
 * member is a phone number exposed on a public page.
 *
 * There is no `down`: the original seller is not recorded anywhere, so the
 * change cannot be reversed. Dropping to a no-op is honest about that.
 */
export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const shops = await collection(payload, "shops")
		.find({}, { projection: { _id: 1, owner: 1 } })
		.toArray();

	let updated = 0;
	for (const shop of shops) {
		if (!shop.owner) continue;
		const result = await collection(payload, "listings").updateMany(
			{ shop: shop._id, seller: { $ne: shop.owner } },
			{ $set: { seller: shop.owner } },
		);
		updated += result.modifiedCount;
	}

	payload.logger.info({
		msg: "[migration] shop listings now carry the shop owner as seller",
		updated,
	});
}

export async function down(_args: MigrateDownArgs): Promise<void> {
	// Irreversible: the previous seller was not recorded.
}
