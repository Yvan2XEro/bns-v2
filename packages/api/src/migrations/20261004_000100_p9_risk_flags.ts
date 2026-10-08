import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const collection = (payload: MigrateUpArgs["payload"], slug: string) =>
	(payload.db as unknown as MongooseAdapter).collections[slug].collection;

export const OPEN_RISK_FLAG_INDEX = "risk_flags_one_open_subject_signal";

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	await collection(payload, "risk-flags").createIndex(
		{ subjectType: 1, subjectKey: 1, signal: 1 },
		{
			unique: true,
			name: OPEN_RISK_FLAG_INDEX,
			partialFilterExpression: { status: "open" },
		},
	);
	payload.logger.info({
		msg: "[migration] P9: one open risk flag per subject and signal",
		index: OPEN_RISK_FLAG_INDEX,
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await collection(payload, "risk-flags")
		.dropIndex(OPEN_RISK_FLAG_INDEX)
		.catch(() => undefined);
}
