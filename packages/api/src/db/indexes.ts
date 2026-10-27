import type { Payload } from "payload";

/**
 * The database indexes the collection configs cannot declare: partial
 * unique indexes — each a business rule a service-level check alone cannot
 * win against two simultaneous requests — and a TTL. Applied at every boot
 * (`ensureIndexes`), so a new database gets them all and an existing one is
 * brought in line; creating an index that already matches costs nothing.
 *
 * The plain indexes (`index: true`, `unique: true` on a field) stay on the
 * fields themselves: Payload creates those.
 */
export interface IndexSpec {
	collection: string;
	name: string;
	keys: Record<string, 1 | -1>;
	options: Record<string, unknown>;
}

export const INDEXES: readonly IndexSpec[] = [
	// One product per listing.
	{
		collection: "products",
		name: "listing_1_unique",
		keys: { listing: 1 },
		options: {
			unique: true,
			partialFilterExpression: { listing: { $type: "objectId" } },
		},
	},
	// A sku is unique within a shop, among live variants.
	{
		collection: "product-variants",
		name: "shop_1_sku_1_unique",
		keys: { shop: 1, sku: 1 },
		options: {
			unique: true,
			partialFilterExpression: {
				archivedAt: null,
				sku: { $type: "string", $gt: "" },
			},
		},
	},
	// One open verification request per subject.
	{
		collection: "verification-requests",
		name: "verification_open_key_unique",
		keys: { openKey: 1 },
		options: {
			unique: true,
			partialFilterExpression: { openKey: { $type: "string" } },
		},
	},
	// One pending invitation per shop and address.
	{
		collection: "shop-invitations",
		name: "pendingKey_1_unique_pending",
		keys: { pendingKey: 1 },
		options: {
			unique: true,
			partialFilterExpression: {
				status: "pending",
				pendingKey: { $type: "string" },
			},
		},
	},
	// One active cart per user.
	{
		collection: "carts",
		name: "carts_active_user_unique",
		keys: { user: 1 },
		options: { unique: true, partialFilterExpression: { status: "active" } },
	},
	// A replayed checkout returns the order instead of creating a second.
	{
		collection: "orders",
		name: "orders_buyer_idempotency_unique",
		keys: { buyer: 1, idempotencyKey: 1 },
		options: {
			unique: true,
			partialFilterExpression: { idempotencyKey: { $type: "string" } },
		},
	},
	// One commission charge per order: a retried transition never charges twice.
	{
		collection: "commission-lines",
		name: "commission_charge_per_order_unique",
		keys: { order: 1, kind: 1 },
		options: { unique: true, partialFilterExpression: { kind: "charge" } },
	},
	// One review per reviewer, reviewed user and shop.
	{
		collection: "reviews",
		name: "reviewer_1_reviewedUser_1_shop_1_unique",
		keys: { reviewer: 1, reviewedUser: 1, shop: 1 },
		options: { unique: true },
	},
	// One buyer-fee invoice per order.
	{
		collection: "buyer-fee-invoices",
		name: "buyer_fee_invoice_per_order_unique",
		keys: { order: 1 },
		options: { unique: true, partialFilterExpression: { kind: "invoice" } },
	},
	// One active dispute per order.
	{
		collection: "disputes",
		name: "disputes_one_active_per_order",
		keys: { order: 1 },
		options: {
			unique: true,
			partialFilterExpression: {
				status: {
					$in: ["open", "awaiting_seller", "awaiting_buyer", "under_review"],
				},
			},
		},
	},
	// One active strike per source.
	{
		collection: "shop-strikes",
		name: "shop_strikes_one_active_source",
		keys: { shop: 1, kind: 1, sourceType: 1, sourceId: 1 },
		options: { unique: true, partialFilterExpression: { status: "active" } },
	},
	// One open risk flag per subject and signal.
	{
		collection: "risk-flags",
		name: "risk_flags_one_open_subject_signal",
		keys: { subjectType: 1, subjectKey: 1, signal: 1 },
		options: { unique: true, partialFilterExpression: { status: "open" } },
	},
	// One live shipment per order.
	{
		collection: "shipments",
		name: "shipments_one_live_per_order",
		keys: { order: 1 },
		options: {
			unique: true,
			partialFilterExpression: {
				status: {
					$in: [
						"pending",
						"picked_up",
						"in_transit",
						"delivered",
						"failed",
						"returned",
					],
				},
			},
		},
	},
	// One default dispatch origin per shop.
	{
		collection: "shop-locations",
		name: "shop_locations_one_default_origin",
		keys: { shop: 1 },
		options: {
			unique: true,
			partialFilterExpression: { isDefaultOrigin: true },
		},
	},
	// A shop resells a product once.
	{
		collection: "listings",
		name: "listings_one_resale_product_per_shop",
		keys: { shop: 1, product: 1 },
		options: {
			unique: true,
			partialFilterExpression: {
				shop: { $type: "objectId" },
				product: { $type: "objectId" },
			},
		},
	},
	// One view counter flush per listing and day.
	{
		collection: "listing-view-flushes",
		name: "listing_view_flushes_listing_date",
		keys: { listing: 1, date: 1 },
		options: { unique: true },
	},
	// Flush rows expire on their own (ttl).
	{
		collection: "listing-view-flushes",
		name: "listing_view_flushes_purge_at",
		keys: { purgeAt: 1 },
		options: { expireAfterSeconds: 0 },
	},
	// One mobile-money commission invoice per shop and week.
	{
		collection: "commission-invoices",
		name: "commission_invoice_weekly_period_unique",
		keys: { shop: 1, periodStart: 1 },
		options: {
			unique: true,
			partialFilterExpression: { settlement: "mobile_money", kind: "invoice" },
		},
	},
	// One open stock count per shop.
	{
		collection: "stock-count-sessions",
		name: "stock_count_sessions_one_open_per_shop",
		keys: { shop: 1 },
		options: { unique: true, partialFilterExpression: { status: "open" } },
	},
	// One phone reveal counted per viewer, listing and window.
	{
		collection: "contact-reveals",
		name: "viewer_1_listing_1_revealWindow_1",
		keys: { viewer: 1, listing: 1, revealWindow: 1 },
		options: { unique: true },
	},
];

interface IndexedCollection {
	createIndex(
		keys: Record<string, 1 | -1>,
		options: Record<string, unknown>,
	): Promise<string>;
	dropIndex(name: string): Promise<unknown>;
}

/** MongoDB's codes for an index whose name or keys exist with other options. */
const CONFLICT_CODES = new Set([85, 86]);

function codeOf(error: unknown): number | undefined {
	return error && typeof error === "object" && "code" in error
		? Number((error as { code: unknown }).code)
		: undefined;
}

/**
 * Creates every index in INDEXES. One defined differently before (another
 * filter, other keys) is dropped and recreated. A failure on one — duplicate
 * rows a unique index refuses — does not stop the others; they are all
 * reported at the end, thrown so the boot task retries on the next start.
 */
export async function ensureIndexes(
	collectionOf: (slug: string) => IndexedCollection,
): Promise<{ created: number }> {
	const failed: string[] = [];
	for (const spec of INDEXES) {
		const collection = collectionOf(spec.collection);
		const options = { ...spec.options, name: spec.name };
		try {
			await collection.createIndex(spec.keys, options);
		} catch (error) {
			if (!CONFLICT_CODES.has(codeOf(error) ?? 0)) {
				failed.push(
					`${spec.collection}.${spec.name}: ${(error as Error).message}`,
				);
				continue;
			}
			try {
				await collection.dropIndex(spec.name);
				await collection.createIndex(spec.keys, options);
			} catch (retry) {
				failed.push(
					`${spec.collection}.${spec.name}: ${(retry as Error).message}`,
				);
			}
		}
	}
	if (failed.length > 0) {
		throw new Error(
			`${failed.length} index(es) not created:\n${failed.join("\n")}`,
		);
	}
	return { created: INDEXES.length };
}

/** The Mongo collection behind a Payload collection. */
export function mongoCollectionOf(payload: Payload) {
	const db = payload.db as unknown as {
		collections: Record<string, { collection: IndexedCollection }>;
	};
	return (slug: string): IndexedCollection => {
		const model = db.collections[slug];
		if (!model) throw new Error(`unknown collection ${slug}`);
		return model.collection;
	};
}
