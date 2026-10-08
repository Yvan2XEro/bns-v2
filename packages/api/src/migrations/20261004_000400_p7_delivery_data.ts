import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-mongodb";
import { migrateP4DeliveryData } from "./p7DeliveryData";

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	await migrateP4DeliveryData(payload);
	payload.logger.info({ msg: "[migration] P7: migrated P4 delivery data" });
}

export async function down(_args: MigrateDownArgs): Promise<void> {
	// Shipment history is intentionally irreversible.
}
