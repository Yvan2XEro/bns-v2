import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-mongodb";
import { migrateP10Markets } from "./p10Markets";

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	await migrateP10Markets(payload);
	payload.logger.info({ msg: "[migration] P10: seeded the CM market" });
}

export async function down(_args: MigrateDownArgs): Promise<void> {
	// The market rows and the stamped orders are intentionally irreversible.
}
