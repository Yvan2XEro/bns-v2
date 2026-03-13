import { transformListing } from "./handlers/listingCreated.ts";
import {
	clearIndex,
	configureIndex,
	indexDocuments,
	type ListingDocument,
} from "./meilisearch.ts";

const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";
const PAGE_SIZE = 100;

async function fetchAllListings(): Promise<{
	documents: ListingDocument[];
	total: number;
	skipped: number;
}> {
	const documents: ListingDocument[] = [];
	let page = 1;
	let hasMore = true;
	let total = 0;
	let skipped = 0;

	while (hasMore) {
		const response = await fetch(
			`${PAYLOAD_API_URL}/listings?depth=1&limit=${PAGE_SIZE}&page=${page}`,
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch listings: ${response.status}`);
		}

		const data = (await response.json()) as {
			docs: Record<string, unknown>[];
			hasNextPage: boolean;
			totalDocs: number;
		};

		total = data.totalDocs;

		for (const listing of data.docs) {
			if (listing.status === "published") {
				documents.push(transformListing(listing));
			} else {
				skipped++;
			}
		}

		console.log(
			`[search-indexer] reindex fetched page ${page} (${data.docs.length} listings, ${documents.length} indexed so far, ${skipped} skipped)`,
		);

		hasMore = data.hasNextPage;
		page++;
	}

	return { documents, total, skipped };
}

async function main(): Promise<void> {
	console.log("[search-indexer] reindex starting bulk reindex...");

	await configureIndex();

	console.log("[search-indexer] reindex clearing existing index...");
	await clearIndex();

	console.log("[search-indexer] reindex fetching all listings from Payload...");
	const { documents, total, skipped } = await fetchAllListings();

	console.log(
		`[search-indexer] reindex fetched ${total} total listings: ${documents.length} to index, ${skipped} skipped (not published)`,
	);

	if (documents.length > 0) {
		await indexDocuments(documents);
	}

	console.log(
		`[search-indexer] reindex complete: indexed=${documents.length} skipped=${skipped} total=${total}`,
	);
}

main().catch((error) => {
	console.error("[search-indexer] reindex fatal error:", error);
	process.exit(1);
});
