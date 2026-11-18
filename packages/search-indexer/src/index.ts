import { handleListingCreated } from "./handlers/listingCreated.ts";
import { handleListingDeleted } from "./handlers/listingDeleted.ts";
import { handleListingUpdated } from "./handlers/listingUpdated.ts";
import {
	handleShopDeleted,
	handleShopUpdated,
} from "./handlers/shopUpdated.ts";
import {
	configureIndex,
	configureShopsIndex,
	startFilterableAttributeRefresh,
} from "./meilisearch.ts";
import { createSubscriber, type SearchEvent } from "./redis.ts";
import { ensureDocumentsCurrent } from "./reindex.ts";

const REBUILD_ATTEMPTS = 20;
const REBUILD_RETRY_MS = 60_000;

/**
 * Brings the documents up to `DOCUMENT_VERSION` in the background, while live
 * events keep flowing. The API may still be applying migrations when this
 * worker starts, so a failure is retried rather than fatal.
 */
async function rebuildWhenStale(): Promise<void> {
	for (let attempt = 1; attempt <= REBUILD_ATTEMPTS; attempt++) {
		try {
			await ensureDocumentsCurrent();
			return;
		} catch (error) {
			console.warn(
				`[search-indexer] rebuild attempt ${attempt}/${REBUILD_ATTEMPTS} failed:`,
				error instanceof Error ? error.message : error,
			);
			await new Promise((resolve) => setTimeout(resolve, REBUILD_RETRY_MS));
		}
	}
	console.error(
		"[search-indexer] gave up rebuilding stale documents; restart the worker to retry",
	);
}

async function handleEvent(event: SearchEvent): Promise<void> {
	console.log(`[search-indexer] Processing event: ${JSON.stringify(event)}`);

	switch (event.event) {
		case "listing.created":
			await handleListingCreated(event.listingId);
			break;
		case "listing.updated":
			await handleListingUpdated(event.listingId);
			break;
		case "listing.deleted":
			await handleListingDeleted(event.listingId);
			break;
		case "shop.created":
		case "shop.updated":
			await handleShopUpdated(event.shopId, {
				reindexListings: event.reindexListings === true,
			});
			break;
		case "shop.deleted":
			await handleShopDeleted(event.shopId);
			break;
		default:
			console.warn(`[search-indexer] Unknown event: ${JSON.stringify(event)}`);
	}
}

async function main(): Promise<void> {
	console.log("[search-indexer] Starting worker...");
	console.log(
		`[search-indexer] Connecting to Redis at ${process.env.REDIS_URL || "redis://localhost:6379"}`,
	);

	await configureIndex();
	await configureShopsIndex();
	console.log("[search-indexer] Meilisearch index configured");

	// Categories change from the admin, without anything restarting this worker.
	const stopRefresh = startFilterableAttributeRefresh();

	const subscriber = createSubscriber(handleEvent);
	await subscriber.start();

	console.log("[search-indexer] Worker is running, waiting for events...");

	void rebuildWhenStale();

	const shutdown = async () => {
		console.log("[search-indexer] Shutting down...");
		stopRefresh();
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
