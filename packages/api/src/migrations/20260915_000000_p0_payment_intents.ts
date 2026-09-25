import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-mongodb";
import { backfillBoostPaymentIntents } from "../services/paymentBackfill";

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
	const result = await backfillBoostPaymentIntents(payload, { req });
	payload.logger.info({
		msg: "[migration] boost payment intents backfilled",
		...result,
	});
}

export async function down(_args: MigrateDownArgs): Promise<void> {
	// Intents are payment records and are kept; the backfill is idempotent, so there is nothing to undo.
}
