import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const INDEX_NAME = "listings_one_resale_product_per_shop";

const listingsCollection = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections.listings.collection;

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const collection = listingsCollection(payload);
	// P1's global product index conflicts with P8: each reseller has one listing
	// per product, while the supplier's source listing must remain independent.
	await collection.dropIndex("product_1_unique").catch(() => undefined);
	const duplicates = await collection
		.aggregate([
			{
				$match: { shop: { $type: "objectId" }, product: { $type: "objectId" } },
			},
			{
				$group: {
					_id: { shop: "$shop", product: "$product" },
					listingIds: { $push: "$_id" },
				},
			},
			{ $match: { "listingIds.1": { $exists: true } } },
		])
		.toArray();

	if (duplicates.length > 0) {
		payload.logger.error({
			msg: "[migration] P8 resale listing duplicates must be resolved before creating the unique index",
			duplicates: duplicates.map((row) => ({
				shop: String(row._id.shop),
				product: String(row._id.product),
				listingIds: (row.listingIds as unknown[]).map(String),
			})),
		});
		throw new Error("P8 resale listing duplicate pairs prevent index creation");
	}

	await collection.createIndex(
		{ shop: 1, product: 1 },
		{
			unique: true,
			name: INDEX_NAME,
			partialFilterExpression: {
				shop: { $type: "objectId" },
				product: { $type: "objectId" },
			},
		},
	);
	payload.logger.info({
		msg: "[migration] P8: one product-backed listing per reseller shop",
		index: INDEX_NAME,
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await listingsCollection(payload)
		.dropIndex(INDEX_NAME)
		.catch(() => undefined);
}
