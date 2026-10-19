import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-mongodb";
import { flattenTagNames, localizeTagNames } from "./tagLocales";

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const { untranslated, ...counts } = await localizeTagNames(payload);
	payload.logger.info({
		msg: "[migration] tag names: moved onto the fr/en locales",
		...counts,
		untranslatedCount: untranslated.length,
	});
	if (untranslated.length > 0) {
		payload.logger.warn({
			msg: "[migration] tag names kept as French with no English — translate them in the admin",
			untranslated,
		});
	}
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	const counts = await flattenTagNames(payload);
	payload.logger.info({
		msg: "[migration] tag names: back to plain strings (French first)",
		...counts,
	});
}
