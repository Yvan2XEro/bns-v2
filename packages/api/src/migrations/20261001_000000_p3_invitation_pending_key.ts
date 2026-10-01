import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const INDEX_NAME = "pendingKey_1_unique_pending";

const invitations = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections["shop-invitations"]
		.collection;

/**
 * One pending invitation per (shop, channel, target). The filter narrows to
 * exactly the rows the invariant covers: an accepted, declined, revoked or
 * expired invitation to the same person must be allowed to coexist with a new
 * pending one, and a row whose `pendingKey` was cleared on response is out of
 * the index entirely.
 *
 * The service checks for a pending invitation before inserting, so this index
 * is what closes the window between that read and the write — two invites
 * racing on the same number lose one to E11000, which `inviteMember` maps to
 * `team.invitationPending`.
 */
const PARTIAL_FILTER = {
	status: "pending",
	pendingKey: { $type: "string" },
} as const;

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const duplicates = await invitations(payload)
		.aggregate([
			{ $match: PARTIAL_FILTER },
			{ $group: { _id: "$pendingKey", ids: { $push: "$_id" } } },
			{ $match: { "ids.1": { $exists: true } } },
		])
		.toArray();

	if (duplicates.length > 0) {
		// P3 is the phase that introduces this collection, so on real data this
		// is empty. If a partial deploy created duplicates, revoking all but the
		// newest by hand is the fix; throwing keeps the migration unrecorded so
		// the next deploy retries it.
		payload.logger.error({
			msg: "[migration] more than one pending shop-invitation shares a pendingKey; the partial unique index was NOT created",
			duplicates: duplicates.map((group) => ({
				pendingKey: String(group._id),
				invitationIds: (group.ids as unknown[]).map(String),
			})),
		});
		throw new Error(
			`[migration] ${duplicates.length} pendingKey group(s) collide; revoke the extras and re-run this migration`,
		);
	}

	await invitations(payload).createIndex(
		{ pendingKey: 1 },
		{ unique: true, name: INDEX_NAME, partialFilterExpression: PARTIAL_FILTER },
	);
	payload.logger.info({
		msg: "[migration] one pending shop-invitation per (shop, channel, target)",
		index: INDEX_NAME,
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await invitations(payload)
		.dropIndex(INDEX_NAME)
		.catch(() => undefined);
}
