import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-mongodb";
import { migrateTagCategoryScope } from "./tagsCategoryScope";

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const report = await migrateTagCategoryScope(payload);
	payload.logger.info({
		msg: "[migration] tags: scoped to categories",
		...report,
	});
}

export async function down(_args: MigrateDownArgs): Promise<void> {
	// Dropped listing tags are not restored: they no longer applied.
}
