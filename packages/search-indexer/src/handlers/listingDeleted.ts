import { deleteDocument } from "../meilisearch.ts";

export async function handleListingDeleted(listingId: string): Promise<void> {
	console.log(`[handler] Processing listing.deleted for ${listingId}`);
	await deleteDocument(listingId);
}
