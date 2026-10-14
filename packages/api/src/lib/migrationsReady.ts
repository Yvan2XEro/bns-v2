import type { MigrateUpArgs, MongooseAdapter } from "@payloadcms/db-mongodb";

type Migration = {
	name: string;
	up: (args: MigrateUpArgs) => Promise<void>;
	down: (args: never) => Promise<void>;
};

/**
 * Mongoose creates each collection in the background when Payload connects,
 * and Payload starts the first migration without waiting for it. Inside a
 * transaction, a write to a collection Mongoose is creating at that instant
 * fails with "Collection namespace … is already in use" — on an empty
 * database, every boot. Each migration therefore waits for every model to
 * finish initialising first; `Model.init()` is memoised, so after the first
 * wait this costs nothing.
 */
export function afterCollectionsReady<M extends Migration>(
	migrations: M[],
): M[] {
	return migrations.map((migration) => ({
		...migration,
		up: async (args: MigrateUpArgs) => {
			const db = args.payload.db as unknown as MongooseAdapter;
			await Promise.all(
				[
					...Object.values(db.collections),
					...Object.values(db.versions),
					...(db.globals ? [db.globals] : []),
				].map((model) => model.init()),
			);
			await migration.up(args);
		},
	}));
}
