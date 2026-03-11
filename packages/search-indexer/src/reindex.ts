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

async function fetchAllListings(): Promise<ListingDocument[]> {
	const documents: ListingDocument[] = [];
	let page = 1;
	let hasMore = true;

	while (hasMore) {
		console.log(`[reindex] Fetching page ${page}...`);

		const response = await fetch(
			`${PAYLOAD_API_URL}/listings?depth=1&limit=${PAGE_SIZE}&page=${page}`,
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch listings: ${response.status}`);
		}

		const data = (await response.json()) as {
			docs: Record<string, unknown>[];
			hasNextPage: boolean;
		};

		for (const listing of data.docs) {
			documents.push(transformListing(listing));
		}

		hasMore = data.hasNextPage;
		page++;
	}

	return documents;
}

async function main(): Promise<void> {
	console.log("[reindex] Starting bulk reindex...");

	await configureIndex();

	console.log("[reindex] Clearing existing index...");
	await clearIndex();

	console.log("[reindex] Fetching all listings from Payload...");
	const documents = await fetchAllListings();

	console.log(`[reindex] Found ${documents.length} listings to index`);

	if (documents.length > 0) {
		await indexDocuments(documents);
	}

	console.log("[reindex] Bulk reindex complete");
}

main().catch((error) => {
	console.error("[reindex] Fatal error:", error);
	process.exit(1);
});
