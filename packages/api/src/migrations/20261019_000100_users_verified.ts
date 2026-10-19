import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

/**
 * `auth.verify` makes Payload's session check require `_verified`, which no
 * account created before it carries: without this every signed-in person
 * would be signed out, and no existing account could sign in again. They are
 * kept as they were (docs/account-trust-2026-10.md); only accounts created
 * from now on wait for their link.
 */
export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const users = (payload.db as unknown as MongooseAdapter).collections.users
		?.collection;
	if (!users) throw new Error("Mongo collection 'users' is unavailable.");
	const result = await users.updateMany(
		{ _verified: { $exists: false } },
		{ $set: { _verified: true } },
	);
	payload.logger.info({
		msg: "[migration] existing accounts kept signed in under email verification",
		accounts: result.modifiedCount,
	});
}

/** Nothing to undo: `_verified: true` is what an account had in effect before. */
export async function down(_: MigrateDownArgs): Promise<void> {
	// Kept verified: unmarking them would sign everyone out again.
}
