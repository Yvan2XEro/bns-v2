import type { MongooseAdapter } from "@payloadcms/db-mongodb";
import { ObjectId } from "mongodb";
import type { Payload, PayloadRequest } from "payload";
import { queueSearchEvent } from "../hooks/searchEvents";
import { getListingCategoryType } from "../lib/listingFormPreset";

/** A relationship may be stored as an ObjectId or as its hex string. */
function sameId(id: string): { $in: unknown[] } {
	return { $in: ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id] };
}

/**
 * Brings every listing's stored `kind` in line with its category's kind of
 * ad: once at deploy for the listings written before the field existed, and
 * whenever staff change a category's “Kind of ad”, which every category
 * below it inherits.
 *
 * Written straight to the collection: the listing hook only sets `kind` on a
 * write that revalidates the ad, and re-running that validation on old ads
 * is not this task's business. Published ads are re-sent to search.
 */
export async function syncListingKinds(
	payload: Payload,
	{
		log = () => undefined,
		req,
	}: {
		log?: (line: string) => void;
		/** From a category hook: read the tree as that write left it. */
		req?: PayloadRequest;
	} = {},
): Promise<{ updated: number }> {
	const categories = await payload.find({
		collection: "categories",
		// The kind is inherited: populate the ancestors.
		depth: 3,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	const listings = (payload.db as unknown as MongooseAdapter).collections
		.listings?.collection;
	if (!listings) throw new Error("Mongo collection 'listings' is unavailable.");

	let updated = 0;
	for (const category of categories.docs) {
		const kind = getListingCategoryType(category);
		const filter = { category: sameId(category.id), kind: { $ne: kind } };
		const stale = await listings
			.find(filter, { projection: { _id: 1, status: 1 } })
			.toArray();
		if (stale.length === 0) continue;
		await listings.updateMany(filter, { $set: { kind } });
		updated += stale.length;
		log(`${category.slug}: ${stale.length} listing(s) → ${kind}`);
		for (const listing of stale) {
			if (listing.status === "published")
				await queueSearchEvent(null, "listing.updated", String(listing._id));
		}
	}
	return { updated };
}
