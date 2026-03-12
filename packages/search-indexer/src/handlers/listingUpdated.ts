import { handleListingCreated } from "./listingCreated.ts";

export async function handleListingUpdated(listingId: string): Promise<void> {
	console.log(`[handler] Processing listing.updated for ${listingId}`);
	await handleListingCreated(listingId);
}
