import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const INDEX_NAME = "product_1_unique";

const listingsCollection = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections.listings.collection;

/**
 * The index cannot be `unique` alone, nor merely `sparse`: every listing that
 * does not come from a product stores `product: null` (the Listings hook writes
 * it explicitly), and a sparse index still indexes nulls, so the second such
 * listing would collide with the first. The partial filter narrows the
 * constraint to the rows that carry a real product reference.
 */
const PARTIAL_FILTER = { product: { $type: "objectId" } } as const;

async function duplicateProducts(
	payload: MigrateUpArgs["payload"],
): Promise<Array<{ product: string; listingIds: string[] }>> {
	const groups = await listingsCollection(payload)
		.aggregate([
			{ $match: { product: { $type: "objectId" } } },
			{ $group: { _id: "$product", ids: { $push: "$_id" } } },
			{ $match: { "ids.1": { $exists: true } } },
		])
		.toArray();
	return groups.map((group) => ({
		product: String(group._id),
		listingIds: (group.ids as unknown[]).map(String),
	}));
}

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const duplicates = await duplicateProducts(payload);
	if (duplicates.length > 0) {
		// Skipped, not thrown, for the reason the P0 reviews migration gives:
		// blocking a deploy on data that predates this branch costs more than the
		// race it closes. error, not warn: this environment will keep running
		// without the database-level guard, so two concurrent first publishes can
		// still leave a product with two listings. `syncProductListing` adopts the
		// listing it finds first, which means the product's own pointer decides
		// which of the duplicates is live and the other is stranded. Resolve the
		// groups below — keep the listing the product points at, delete the rest —
		// then delete this migration's row from `payload-migrations` and run it
		// again.
		payload.logger.error({
			msg: "[migration] products with more than one listing kept for staff review; the partial unique index on listings.product was NOT created",
			duplicates,
		});
		return;
	}

	// Idempotent: creating an index that already exists with the same name and
	// the same options is a no-op in Mongo.
	await listingsCollection(payload).createIndex(
		{ product: 1 },
		{ unique: true, name: INDEX_NAME, partialFilterExpression: PARTIAL_FILTER },
	);
	payload.logger.info({
		msg: "[migration] listings.product is now unique per product",
		index: INDEX_NAME,
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await listingsCollection(payload)
		.dropIndex(INDEX_NAME)
		.catch(() => undefined);
}
