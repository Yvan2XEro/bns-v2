import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const OPEN_KEY_INDEX = "verification_open_key_unique";

/** One open request per shop and level, enforced by the database rather than by a read-then-write. */
const OPEN_KEY_FILTER = { openKey: { $type: "string" } } as const;

const raw = (payload: MigrateUpArgs["payload"], slug: string) =>
	(payload.db as unknown as MongooseAdapter).collections[slug].collection;

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const users = raw(payload, "users");

	// Keep the fact that an admin had ticked the box; it grants nothing, because
	// the box checked nothing. Idempotent: after the $unset below, the query
	// matches nothing on a second run.
	const legacy = await users.find({ verified: true }).toArray();
	for (const user of legacy) {
		await users.updateOne(
			{ _id: user._id },
			{ $set: { legacyVerifiedAt: user.updatedAt ?? new Date() } },
		);
	}

	await users.updateMany({}, { $unset: { verified: "" } });

	await raw(payload, "verification-requests").createIndex(
		{ openKey: 1 },
		{
			unique: true,
			name: OPEN_KEY_INDEX,
			partialFilterExpression: OPEN_KEY_FILTER,
		},
	);

	payload.logger.info({
		msg: "[migration] users.verified retired; verification-requests.openKey is unique per open request",
		legacyVerifiedUsers: legacy.length,
		index: OPEN_KEY_INDEX,
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await raw(payload, "verification-requests")
		.dropIndex(OPEN_KEY_INDEX)
		.catch(() => undefined);
	// `verified` is not restored: `legacyVerifiedAt` is the record of who had
	// it, and re-deriving a boolean from it would re-create the exact
	// meaningless badge this migration removed.
}
