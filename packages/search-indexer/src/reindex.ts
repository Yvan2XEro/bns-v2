import { transformListing } from "./handlers/listingCreated.ts";
import { fetchDeliveryCities, transformShop } from "./handlers/shopUpdated.ts";
import {
	clearIndex,
	clearShopsIndex,
	configureIndex,
	configureShopsIndex,
	indexDocuments,
	indexShopDocuments,
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
			`${PAYLOAD_API_URL}/listings?depth=2&limit=${PAGE_SIZE}&page=${page}`,
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

	await reindexShops();
}

/** Active shops only — a suspended or closed one has no business in the shops index. */
export async function reindexShops(): Promise<number> {
	console.log("[search-indexer] reindex shops...");
	await configureShopsIndex();
	await clearShopsIndex();
	let shopPage = 1;
	let shopCount = 0;
	for (;;) {
		const response = await fetch(
			`${PAYLOAD_API_URL}/shops?depth=1&limit=${PAGE_SIZE}&page=${shopPage}`,
		);
		if (!response.ok)
			throw new Error(`Failed to fetch shops: ${response.status}`);
		const data = (await response.json()) as {
			docs: Record<string, unknown>[];
			hasNextPage: boolean;
		};
		const docs = await Promise.all(
			data.docs
				.filter((shop) => shop.status === "active")
				.map(async (shop) => {
					const shopId = String(shop.id);
					return transformShop(shop, await fetchDeliveryCities(shopId));
				}),
		);
		await indexShopDocuments(docs);
		shopCount += docs.length;
		if (!data.hasNextPage) break;
		shopPage++;
	}
	console.log(`[search-indexer] reindex shops complete: indexed=${shopCount}`);
	return shopCount;
}

// `import.meta.main` keeps a test import of this module from firing the
// bulk reindex against a real (or absent) Payload API.
if (import.meta.main) {
	main().catch((error) => {
		console.error("[search-indexer] reindex fatal error:", error);
		process.exit(1);
	});
}
