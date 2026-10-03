import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const collection = (payload: MigrateUpArgs["payload"], slug: string) =>
	(payload.db as unknown as MongooseAdapter).collections[slug].collection;

const P4_PERIOD_INDEX = "commission_invoice_period_unique";
export const WEEKLY_PERIOD_INDEX = "commission_invoice_weekly_period_unique";
export const FEE_INVOICE_INDEX = "buyer_fee_invoice_per_order_unique";

/**
 * - P4's one-invoice-per-`(shop, periodStart)` rule is about the weekly run.
 *   P5's per-order `application_fee` invoices are dated by their order's
 *   completion, and two orders of one shop can complete at the same instant
 *   (one `completeOrders` pass), so the rule now binds `mobile_money`
 *   invoices only. Invoices written before P5 carry no `settlement`; they are
 *   all weekly ones and are stamped first so the narrowed index still covers
 *   them.
 * - One buyer fee invoice per order (credit notes excluded): the guard behind
 *   `issueBuyerFeeInvoice`'s replays when two of them race.
 *
 * Idempotent: the backfill matches nothing the second time, and dropping a
 * missing index is swallowed.
 */
export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const invoices = collection(payload, "commission-invoices");
	const stamped = await invoices.updateMany(
		{ settlement: { $exists: false } },
		{ $set: { settlement: "mobile_money" } },
	);
	await invoices.dropIndex(P4_PERIOD_INDEX).catch(() => undefined);
	await invoices.createIndex(
		{ shop: 1, periodStart: 1 },
		{
			unique: true,
			name: WEEKLY_PERIOD_INDEX,
			partialFilterExpression: { settlement: "mobile_money" },
		},
	);
	await collection(payload, "buyer-fee-invoices").createIndex(
		{ order: 1 },
		{
			unique: true,
			name: FEE_INVOICE_INDEX,
			partialFilterExpression: { kind: "invoice" },
		},
	);
	payload.logger.info({
		msg: "[migration] P5 invoice indexes: weekly-only (shop, periodStart), one fee invoice per order",
		stamped: stamped.modifiedCount,
		indexes: [WEEKLY_PERIOD_INDEX, FEE_INVOICE_INDEX],
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await collection(payload, "buyer-fee-invoices")
		.dropIndex(FEE_INVOICE_INDEX)
		.catch(() => undefined);
	const invoices = collection(payload, "commission-invoices");
	await invoices.dropIndex(WEEKLY_PERIOD_INDEX).catch(() => undefined);
	await invoices.createIndex(
		{ shop: 1, periodStart: 1 },
		{ unique: true, name: P4_PERIOD_INDEX },
	);
}
