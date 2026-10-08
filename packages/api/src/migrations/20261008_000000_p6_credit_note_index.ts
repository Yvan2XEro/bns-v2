import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";
import { WEEKLY_PERIOD_INDEX } from "./20261003_000000_p5_invoice_indexes";

const invoices = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections["commission-invoices"]
		.collection;

/**
 * Credit notes carry no period, so under the weekly-period index a shop's
 * second note would collide on `(shop, null)`. The rule binds invoices only.
 */
export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const collection = invoices(payload);
	await collection.updateMany(
		{ kind: { $exists: false } },
		{ $set: { kind: "invoice" } },
	);
	await collection.dropIndex(WEEKLY_PERIOD_INDEX).catch(() => undefined);
	await collection.createIndex(
		{ shop: 1, periodStart: 1 },
		{
			unique: true,
			name: WEEKLY_PERIOD_INDEX,
			partialFilterExpression: { settlement: "mobile_money", kind: "invoice" },
		},
	);
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	const collection = invoices(payload);
	await collection.dropIndex(WEEKLY_PERIOD_INDEX).catch(() => undefined);
	await collection.createIndex(
		{ shop: 1, periodStart: 1 },
		{
			unique: true,
			name: WEEKLY_PERIOD_INDEX,
			partialFilterExpression: { settlement: "mobile_money" },
		},
	);
}
