import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-mongodb";
import {
	flattenCategoryLabels,
	localizeCategoryLabels,
} from "./categoryLocales";

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const { untranslated, ...counts } = await localizeCategoryLabels(payload);
	payload.logger.info({
		msg: "[migration] category labels: moved onto the fr/en locales",
		...counts,
		untranslatedCount: untranslated.length,
	});
	if (untranslated.length > 0) {
		payload.logger.warn({
			msg: "[migration] category labels kept as French with no English — translate them in the admin",
			untranslated,
		});
	}
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	const counts = await flattenCategoryLabels(payload);
	payload.logger.info({
		msg: "[migration] category labels: back to plain strings (English first)",
		...counts,
	});
}
