import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const INDEX_NAME = "shop_1_sku_1_unique";

const variantsCollection = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections["product-variants"]
		.collection;

/**
 * `assertUniqueSkus` (services/products.ts) already enforces "one live SKU
 * per shop" with a read-then-write inside the product transaction — the same
 * race shape the two sibling P1 migrations closed with a partial unique
 * index, left open here because SKU uniqueness lives in the service, not the
 * schema. Blank/absent SKUs are legitimate and must keep coexisting (a
 * variant with no SKU is not "sharing" one with another), and an archived
 * variant's SKU is free for reuse (`assertUniqueSkus` filters on
 * `NOT_ARCHIVED` too) — both excluded from the filter, the same way the
 * sibling migrations narrow to the rows their own invariant actually covers.
 * `archivedAt: null` matches Payload's write shape here: every variant is
 * created and restored with `archivedAt: null` explicitly (never left
 * unset), so it plays the same role `NOT_ARCHIVED`'s `or` does in a query —
 * `$eq: null` matches a missing field too.
 */
const PARTIAL_FILTER = {
	archivedAt: null,
	sku: { $type: "string", $gt: "" },
} as const;

async function duplicateSkus(
	payload: MigrateUpArgs["payload"],
): Promise<Array<{ shop: string; sku: string; variantIds: string[] }>> {
	const groups = await variantsCollection(payload)
		.aggregate([
			{ $match: PARTIAL_FILTER },
			{
				$group: { _id: { shop: "$shop", sku: "$sku" }, ids: { $push: "$_id" } },
			},
			{ $match: { "ids.1": { $exists: true } } },
		])
		.toArray();
	return groups.map((group) => ({
		shop: String(group._id.shop),
		sku: String(group._id.sku),
		variantIds: (group.ids as unknown[]).map(String),
	}));
}

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const duplicates = await duplicateSkus(payload);
	if (duplicates.length > 0) {
		// Unlike the two sibling migrations, this one does NOT log-and-return:
		// a SKU is user-entered per shop, far likelier to already collide on
		// real data than the two 1:1 product/listing invariants those migrations
		// guard, and a migration that quietly skips building its index still
		// gets recorded as applied — the guard then stays absent forever with
		// nothing prompting anyone to look. Throwing keeps this migration
		// unrecorded, so the next deploy attempt retries it automatically once
		// the groups below are resolved by hand (keep one SKU per group, blank
		// or renumber the rest).
		payload.logger.error({
			msg: "[migration] shops with a SKU shared by more than one live variant; the partial unique index on product-variants.(shop, sku) was NOT created",
			duplicates,
		});
		throw new Error(
			`[migration] ${duplicates.length} shop/SKU group(s) collide; resolve them and re-run this migration`,
		);
	}

	// Idempotent: creating an index that already exists with the same name and
	// the same options is a no-op in Mongo.
	await variantsCollection(payload).createIndex(
		{ shop: 1, sku: 1 },
		{ unique: true, name: INDEX_NAME, partialFilterExpression: PARTIAL_FILTER },
	);
	payload.logger.info({
		msg: "[migration] product-variants.sku is now unique per shop",
		index: INDEX_NAME,
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await variantsCollection(payload)
		.dropIndex(INDEX_NAME)
		.catch(() => undefined);
}
