import { deleteDocument } from "../meilisearch.ts";

export async function handleListingDeleted(listingId: string): Promise<void> {
	console.log(`[search-indexer] listingDeleted listing=${listingId}`);
	await deleteDocument(listingId);
}
