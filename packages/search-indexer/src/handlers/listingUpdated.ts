import { handleListingCreated } from "./listingCreated.ts";

export async function handleListingUpdated(listingId: string): Promise<void> {
	console.log(`[search-indexer] listingUpdated listing=${listingId}`);
	await handleListingCreated(listingId);
}
