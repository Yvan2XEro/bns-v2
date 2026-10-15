import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-mongodb";
import { migrateConditionToAttribute } from "./conditionToAttribute";

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const report = await migrateConditionToAttribute(payload);
	payload.logger.info({
		msg: "[migration] condition: moved onto category attributes",
		...report,
	});
}

export async function down(_args: MigrateDownArgs): Promise<void> {
	// The values live on in the attributes; the retired field is not restored.
}
