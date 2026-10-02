import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const collection = (payload: MigrateUpArgs["payload"], slug: string) =>
	(payload.db as unknown as MongooseAdapter).collections[slug].collection;

const CARTS_INDEX = "carts_active_user_unique";
const ORDERS_INDEX = "orders_buyer_idempotency_unique";
const COMMISSION_LINES_INDEX = "commission_charge_per_order_unique";
const COMMISSION_INVOICES_INDEX = "commission_invoice_period_unique";

/**
 * Four partial unique indexes, each a business rule a service-level check
 * alone cannot win against two simultaneous requests:
 *
 * - one active cart per user — the partial filter is on `status: "active"`,
 *   not a bare unique on `user`, because an abandoned or converted cart must
 *   stay legal to keep around for the same user;
 * - one order per `(buyer, idempotencyKey)` — a replayed checkout returns the
 *   existing order instead of creating a second one, but only once
 *   `idempotencyKey` is actually a string: an order's buyer can be cleared to
 *   null by account deletion, and null/null pairs must not collide;
 * - one `charge` commission line per order — a delivery transition retried
 *   after a crash must not double-charge the shop;
 * - one commission invoice per `(shop, periodStart)` — `issueCommissionInvoices`
 *   is idempotent against this alone, with no separate check needed.
 */
export async function up({ payload }: MigrateUpArgs): Promise<void> {
	await collection(payload, "carts").createIndex(
		{ user: 1 },
		{
			unique: true,
			name: CARTS_INDEX,
			partialFilterExpression: { status: "active" },
		},
	);
	await collection(payload, "orders").createIndex(
		{ buyer: 1, idempotencyKey: 1 },
		{
			unique: true,
			name: ORDERS_INDEX,
			partialFilterExpression: { idempotencyKey: { $type: "string" } },
		},
	);
	await collection(payload, "commission-lines").createIndex(
		{ order: 1, kind: 1 },
		{
			unique: true,
			name: COMMISSION_LINES_INDEX,
			partialFilterExpression: { kind: "charge" },
		},
	);
	await collection(payload, "commission-invoices").createIndex(
		{ shop: 1, periodStart: 1 },
		{ unique: true, name: COMMISSION_INVOICES_INDEX },
	);

	payload.logger.info({
		msg: "[migration] P4 order indexes created: one active cart per user, one order per (buyer, idempotencyKey), one charge commission line per order, one commission invoice per (shop, periodStart)",
		indexes: [
			CARTS_INDEX,
			ORDERS_INDEX,
			COMMISSION_LINES_INDEX,
			COMMISSION_INVOICES_INDEX,
		],
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await collection(payload, "carts")
		.dropIndex(CARTS_INDEX)
		.catch(() => undefined);
	await collection(payload, "orders")
		.dropIndex(ORDERS_INDEX)
		.catch(() => undefined);
	await collection(payload, "commission-lines")
		.dropIndex(COMMISSION_LINES_INDEX)
		.catch(() => undefined);
	await collection(payload, "commission-invoices")
		.dropIndex(COMMISSION_INVOICES_INDEX)
		.catch(() => undefined);
}
