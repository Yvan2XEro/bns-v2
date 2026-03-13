import { handleListingCreated } from "./handlers/listingCreated.ts";
import { handleListingDeleted } from "./handlers/listingDeleted.ts";
import { handleListingUpdated } from "./handlers/listingUpdated.ts";
import { configureIndex } from "./meilisearch.ts";
import { createSubscriber, type SearchEvent } from "./redis.ts";

async function handleEvent(event: SearchEvent): Promise<void> {
	const { event: eventType, listingId } = event;

	console.log(`[search-indexer] Processing event: ${eventType} for listing ${listingId}`);

	switch (eventType) {
		case "listing.created":
			await handleListingCreated(listingId);
			break;
		case "listing.updated":
			await handleListingUpdated(listingId);
			break;
		case "listing.deleted":
			await handleListingDeleted(listingId);
			break;
		default:
			console.warn(`[search-indexer] Unknown event type: ${eventType}`);
	}
}

async function main(): Promise<void> {
	console.log("[search-indexer] Starting worker...");
	console.log(`[search-indexer] Connecting to Redis at ${process.env.REDIS_URL || "redis://localhost:6379"}`);

	await configureIndex();
	console.log("[search-indexer] Meilisearch index configured");

	const subscriber = createSubscriber(handleEvent);
	await subscriber.start();

	console.log("[search-indexer] Worker is running, waiting for events...");

	const shutdown = async () => {
		console.log("[search-indexer] Shutting down...");
		await subscriber.stop();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch((error) => {
	console.error("[search-indexer] Fatal error:", error);
	process.exit(1);
});
