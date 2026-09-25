import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const INDEX_NAME = "listing_1_unique";

const productsCollection = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections.products.collection;

/**
 * Mirrors 20260922_000000_p1_listing_product, the other direction: the
 * partial unique index on `listings.product` stops two listings claiming the
 * same product, but nothing stopped two products claiming the same listing —
 * `attachListings` (services/shopListings.ts) creates the product and sets
 * its `listing` pointer in one write, with no read of the listing's own
 * state in between. Same reasoning for the partial filter: every product
 * without a listing stores `listing: null` (services/products.ts's
 * `detachOne` writes it explicitly on detach), and a sparse index still
 * indexes nulls.
 */
const PARTIAL_FILTER = { listing: { $type: "objectId" } } as const;

async function duplicateListings(
	payload: MigrateUpArgs["payload"],
): Promise<Array<{ listing: string; productIds: string[] }>> {
	const groups = await productsCollection(payload)
		.aggregate([
			{ $match: { listing: { $type: "objectId" } } },
			{ $group: { _id: "$listing", ids: { $push: "$_id" } } },
			{ $match: { "ids.1": { $exists: true } } },
		])
		.toArray();
	return groups.map((group) => ({
		listing: String(group._id),
		productIds: (group.ids as unknown[]).map(String),
	}));
}

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const duplicates = await duplicateListings(payload);
	if (duplicates.length > 0) {
		// Skipped, not thrown, for the same reason as the sibling migration:
		// blocking a deploy on data that predates this branch costs more than
		// the race it closes. error, not warn: this environment keeps running
		// without the database-level guard until the groups below are resolved
		// by hand (keep the product the listing points at, archive the rest)
		// and this migration's row is deleted from `payload-migrations` to run
		// it again.
		payload.logger.error({
			msg: "[migration] listings claimed by more than one product kept for staff review; the partial unique index on products.listing was NOT created",
			duplicates,
		});
		return;
	}

	// Idempotent: creating an index that already exists with the same name and
	// the same options is a no-op in Mongo.
	await productsCollection(payload).createIndex(
		{ listing: 1 },
		{ unique: true, name: INDEX_NAME, partialFilterExpression: PARTIAL_FILTER },
	);
	payload.logger.info({
		msg: "[migration] products.listing is now unique per listing",
		index: INDEX_NAME,
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await productsCollection(payload)
		.dropIndex(INDEX_NAME)
		.catch(() => undefined);
}
